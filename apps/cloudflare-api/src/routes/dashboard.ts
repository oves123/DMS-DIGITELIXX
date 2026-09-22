import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env } from '../index';

const router = new Hono<{ Bindings: Env }>();

router.get('/metrics', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });

        const pendingOrdersResult = await db.select().from(schema.orders).where(eq(schema.orders.status, 'PENDING'));
        const pendingOrders = pendingOrdersResult.length;

        const pendingClaimsResult = await db.select().from(schema.claims).where(eq(schema.claims.status, 'PENDING'));
        const pendingClaims = pendingClaimsResult.length;

        const productsResult = await db.select().from(schema.products);
        const totalProducts = productsResult.length;

        const distributorsResult = await db.select().from(schema.users).where(eq(schema.users.role, 'DISTRIBUTOR'));
        const activeDistributors = distributorsResult.length;

        const variants = await db.select().from(schema.variants);
        const inventories = await db.select().from(schema.inventory);
        const products = await db.select().from(schema.products);

        const prodMap: any = {}; products.forEach(p => prodMap[p.id] = p.name);
        const invMap: any = {}; inventories.forEach(i => invMap[i.variant_id] = i);

        const criticalStock: any[] = [];
        
        variants.forEach(v => {
            const inv = invMap[v.id];
            const stock = inv ? (inv.stock_quantity || 0) : 0;
            const threshold = inv ? (inv.low_stock_threshold || 5) : 5;
            
            if (stock <= threshold) {
                criticalStock.push({
                    variant_id: v.sql_variant_id || v.id,
                    product_name: prodMap[v.product_id] || 'Unknown',
                    pack_size: v.pack_size,
                    current_stock: stock,
                    low_stock_threshold: threshold
                });
            }
        });

        criticalStock.sort((a, b) => a.current_stock - b.current_stock);

        return c.json({
            pendingOrders,
            pendingClaims,
            totalProducts,
            activeDistributors,
            lowStockCount: criticalStock.length,
            criticalStock
        });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server error fetching metrics' }, 500);
    }
});

export default router;
