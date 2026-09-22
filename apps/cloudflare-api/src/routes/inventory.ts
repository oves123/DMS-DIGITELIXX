import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, or } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env } from '../index';

const router = new Hono<{ Bindings: Env }>();

router.get('/', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        
        const products = await db.select().from(schema.products);
        const categories = await db.select().from(schema.categories);
        const variants = await db.select().from(schema.variants);
        const inventories = await db.select().from(schema.inventory);

        const categoryMap: any = {};
        categories.forEach(cat => categoryMap[cat.id] = cat);

        const inventoryMap: any = {};

        products.forEach((p: any) => {
            const cat = categoryMap[p.category_id];
            inventoryMap[p.id] = {
                product_id: p.sql_product_id || p.id,
                name: p.name,
                category_id: cat ? (cat.sql_category_id || cat.id) : null,
                category_name: cat ? cat.name : 'Uncategorized',
                variants: []
            };
        });

        variants.forEach((v: any) => {
            if (inventoryMap[v.product_id]) {
                const inv = inventories.find((i: any) => i.variant_id === v.id);
                inventoryMap[v.product_id].variants.push({
                    variant_id: v.sql_variant_id || v.id,
                    pack_size: v.pack_size,
                    distributor_rate: v.distributor_rate,
                    current_stock: inv ? inv.stock_quantity : 0,
                    low_stock_threshold: inv ? (inv.low_stock_threshold || 5) : 5
                });
            }
        });

        return c.json(Object.values(inventoryMap));
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.post('/update', async (c) => {
    try {
        const { variant_id, added_qty } = await c.req.json();

        if (!added_qty || isNaN(added_qty)) {
            return c.json({ message: 'Invalid quantity' }, 400);
        }

        const db = drizzle(c.env.DB, { schema });

        const variant = await db.query.variants.findFirst({
            where: or(eq(schema.variants.id, variant_id as string), eq(schema.variants.sql_variant_id, parseInt(variant_id as string)))
        });
        if (!variant) return c.json({ message: 'Variant not found' }, 404);

        let inv = await db.query.inventory.findFirst({ where: eq(schema.inventory.variant_id, variant.id) });
        if (inv) {
            await db.update(schema.inventory)
                .set({ stock_quantity: (inv.stock_quantity || 0) + parseInt(added_qty as string) })
                .where(eq(schema.inventory.id, inv.id));
        } else {
            await db.insert(schema.inventory).values({
                id: crypto.randomUUID(),
                variant_id: variant.id,
                stock_quantity: parseInt(added_qty as string),
                low_stock_threshold: 5
            });
        }

        return c.json({ message: 'Stock updated successfully' });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to update stock' }, 500);
    }
});

router.put('/inline/:variant_id', async (c) => {
    try {
        const variant_id = c.req.param('variant_id');
        const { current_stock, low_stock_threshold } = await c.req.json();

        const db = drizzle(c.env.DB, { schema });

        const variant = await db.query.variants.findFirst({
            where: or(eq(schema.variants.id, variant_id), eq(schema.variants.sql_variant_id, parseInt(variant_id)))
        });
        if (!variant) return c.json({ message: 'Variant not found' }, 404);

        let inv = await db.query.inventory.findFirst({ where: eq(schema.inventory.variant_id, variant.id) });
        if (inv) {
            const updateData: any = {};
            if (current_stock !== undefined) updateData.stock_quantity = parseInt(current_stock as string);
            if (low_stock_threshold !== undefined) updateData.low_stock_threshold = parseInt(low_stock_threshold as string);
            
            await db.update(schema.inventory).set(updateData).where(eq(schema.inventory.id, inv.id));
        } else {
            await db.insert(schema.inventory).values({
                id: crypto.randomUUID(),
                variant_id: variant.id,
                stock_quantity: current_stock !== undefined ? parseInt(current_stock as string) : 0,
                low_stock_threshold: low_stock_threshold !== undefined ? parseInt(low_stock_threshold as string) : 5
            });
        }

        return c.json({ message: 'Inventory updated successfully' });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to update inventory inline' }, 500);
    }
});

export default router;
