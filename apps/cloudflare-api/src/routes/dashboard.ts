import { Hono } from 'hono';
import Models from '../db/models';

const router = new Hono();

router.get('/metrics', async (c) => {
    try {
        const pendingOrders = await Models.Order.countDocuments({ status: 'PENDING' });
        const pendingClaims = await Models.Claim.countDocuments({ status: 'PENDING' });
        const totalProducts = await Models.Product.countDocuments();
        const activeDistributors = await Models.User.countDocuments({ role: 'DISTRIBUTOR' });

        const variants = await Models.Variant.aggregate([
            {
                $lookup: {
                    from: 'inventories',
                    localField: '_id',
                    foreignField: 'variant_id',
                    as: 'inventory'
                }
            },
            {
                $unwind: {
                    path: '$inventory',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: 'product_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            {
                $unwind: '$product'
            }
        ]);

        const criticalStock = variants.filter(v => {
            const stock = v.inventory ? v.inventory.stock_quantity : 0;
            const threshold = v.inventory ? (v.inventory.low_stock_threshold || 5) : 5;
            return stock <= threshold;
        }).map(v => ({
            variant_id: v.sql_variant_id || v._id.toString(),
            product_name: v.product.name,
            pack_size: v.pack_size,
            current_stock: v.inventory ? v.inventory.stock_quantity : 0,
            low_stock_threshold: v.inventory ? (v.inventory.low_stock_threshold || 5) : 5
        })).sort((a, b) => a.current_stock - b.current_stock);

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
