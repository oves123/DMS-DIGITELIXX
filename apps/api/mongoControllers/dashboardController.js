const Models = require('../mongoModels/index');

exports.getMetrics = async (req, res) => {
    try {
        const pendingOrders = await Models.Order.countDocuments({ status: 'PENDING' });
        const pendingClaims = await Models.Claim.countDocuments({ status: 'PENDING' });
        const totalProducts = await Models.Product.countDocuments();
        const activeDistributors = await Models.User.countDocuments({ role: 'DISTRIBUTOR' });

        const inventory = await Models.Inventory.find({
            $expr: { $lte: ['$stock_quantity', '$low_stock_threshold'] }
        }).populate({
            path: 'variant_id',
            populate: { path: 'product_id' }
        }).lean();

        const criticalStock = inventory.map(inv => ({
            variant_id: inv.variant_id?.sql_variant_id || inv.variant_id?._id?.toString(),
            product_name: inv.variant_id?.product_id?.name,
            pack_size: inv.variant_id?.pack_size,
            current_stock: inv.stock_quantity,
            low_stock_threshold: inv.low_stock_threshold || 5
        })).sort((a, b) => a.current_stock - b.current_stock);

        res.json({
            pendingOrders,
            pendingClaims,
            totalProducts,
            activeDistributors,
            lowStockCount: criticalStock.length,
            criticalStock
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error fetching metrics' });
    }
};
