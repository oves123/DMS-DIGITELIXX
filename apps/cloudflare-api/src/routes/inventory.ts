import { Hono } from 'hono';
import Models from '../db/models';

const router = new Hono();

function getQueryId(id: string, sqlField: string) {
    return isNaN(Number(id)) ? { _id: id } : { [sqlField]: parseInt(id) };
}

router.get('/', async (c) => {
    try {
        const products = await Models.Product.find().populate('category_id').lean();
        const variants = await Models.Variant.find().lean();
        const inventories = await Models.Inventory.find().lean();

        const inventoryMap: any = {};

        products.forEach((p: any) => {
            inventoryMap[p._id.toString()] = {
                product_id: p.sql_product_id || p._id.toString(),
                name: p.name,
                category_id: p.category_id?.sql_category_id || p.category_id?._id?.toString(),
                category_name: p.category_id?.name,
                variants: []
            };
        });

        variants.forEach((v: any) => {
            if (inventoryMap[v.product_id.toString()]) {
                const inv = inventories.find((i: any) => i.variant_id.toString() === v._id.toString());
                inventoryMap[v.product_id.toString()].variants.push({
                    variant_id: v.sql_variant_id || v._id.toString(),
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

        const vQuery = getQueryId(variant_id as string, 'sql_variant_id');
        const variant = await Models.Variant.findOne(vQuery);
        if (!variant) return c.json({ message: 'Variant not found' }, 404);

        let inv = await Models.Inventory.findOne({ variant_id: variant._id });
        if (inv) {
            inv.stock_quantity += parseInt(added_qty as string);
            await inv.save();
        } else {
            inv = await Models.Inventory.create({
                variant_id: variant._id,
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

        const vQuery = getQueryId(variant_id, 'sql_variant_id');
        const variant = await Models.Variant.findOne(vQuery);
        if (!variant) return c.json({ message: 'Variant not found' }, 404);

        let inv = await Models.Inventory.findOne({ variant_id: variant._id });
        if (inv) {
            if (current_stock !== undefined) inv.stock_quantity = parseInt(current_stock as string);
            if (low_stock_threshold !== undefined) inv.low_stock_threshold = parseInt(low_stock_threshold as string);
            await inv.save();
        } else {
            await Models.Inventory.create({
                variant_id: variant._id,
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
