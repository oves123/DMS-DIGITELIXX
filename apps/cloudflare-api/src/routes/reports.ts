import { Hono } from 'hono';
import Models from '../db/models';
import mongoose from 'mongoose';

const router = new Hono();

router.get('/admin/sales', async (c) => {
    try {
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        let matchStage: any = { status: 'EXECUTED' };

        if (startDate && endDate) {
            matchStage.created_at = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        const sales = await Models.Order.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: 'invoices',
                    localField: '_id',
                    foreignField: 'order_id',
                    as: 'invoice'
                }
            },
            { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
                    total_orders: { $sum: 1 },
                    total_revenue: { $sum: { $ifNull: ['$invoice.grand_total', 0] } }
                }
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    _id: 0,
                    date: '$_id',
                    total_orders: 1,
                    total_revenue: 1
                }
            }
        ]);

        return c.json(sales);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/admin/top-products', async (c) => {
    try {
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        let matchStage: any = { status: 'EXECUTED' };

        if (startDate && endDate) {
            matchStage.created_at = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        const topProducts = await Models.Order.aggregate([
            { $match: matchStage },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.variant_id',
                    total_sold: { $sum: '$items.executed_qty' }
                }
            },
            {
                $lookup: {
                    from: 'variants',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'variant'
                }
            },
            { $unwind: '$variant' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'variant.product_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product._id',
                    product_name: { $first: '$product.name' },
                    total_sold: { $sum: '$total_sold' }
                }
            },
            { $sort: { total_sold: -1 } },
            { $limit: 15 },
            {
                $project: {
                    _id: 0,
                    product_name: 1,
                    total_sold: 1
                }
            }
        ]);

        return c.json(topProducts);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/admin/top-distributors', async (c) => {
    try {
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        let matchStage: any = { status: 'EXECUTED' };

        if (startDate && endDate) {
            matchStage.created_at = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        const topDistributors = await Models.Order.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: 'invoices',
                    localField: '_id',
                    foreignField: 'order_id',
                    as: 'invoice'
                }
            },
            { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: '$distributor_id',
                    total_orders: { $sum: 1 },
                    total_spent: { $sum: { $ifNull: ['$invoice.grand_total', 0] } }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'distributor'
                }
            },
            { $unwind: '$distributor' },
            { $sort: { total_spent: -1 } },
            { $limit: 10 },
            {
                $project: {
                    _id: 0,
                    distributor_name: '$distributor.firm_name',
                    total_orders: 1,
                    total_spent: 1
                }
            }
        ]);

        return c.json(topDistributors);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/admin/inventory-alerts', async (c) => {
    try {
        const inventory = await Models.Inventory.find({
            $expr: { $lte: ['$stock_quantity', '$low_stock_threshold'] }
        }).populate({
            path: 'variant_id',
            populate: { path: 'product_id' }
        }).lean();

        const alerts = inventory.map((inv: any) => ({
            product_name: inv.variant_id?.product_id?.name,
            pack_size: inv.variant_id?.pack_size,
            current_stock_qty: inv.stock_quantity
        })).sort((a, b) => a.current_stock_qty - b.current_stock_qty);

        return c.json(alerts);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/distributor/:id/purchases', async (c) => {
    try {
        const userId = c.req.param('id');
        const userQuery = isNaN(Number(userId)) ? { _id: new mongoose.Types.ObjectId(userId) } : { sql_user_id: parseInt(userId) };
        const user = await Models.User.findOne(userQuery);

        if (!user) return c.json({ message: 'User not found' }, 404);

        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        let matchStage: any = { status: 'EXECUTED', distributor_id: user._id };

        if (startDate && endDate) {
            matchStage.created_at = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        const purchases = await Models.Order.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: 'invoices',
                    localField: '_id',
                    foreignField: 'order_id',
                    as: 'invoice'
                }
            },
            { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
                    total_orders: { $sum: 1 },
                    amount_spent: { $sum: { $ifNull: ['$invoice.grand_total', 0] } }
                }
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    _id: 0,
                    date: '$_id',
                    total_orders: 1,
                    amount_spent: 1
                }
            }
        ]);

        return c.json(purchases);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/distributor/:id/top-products', async (c) => {
    try {
        const userId = c.req.param('id');
        const userQuery = isNaN(Number(userId)) ? { _id: new mongoose.Types.ObjectId(userId) } : { sql_user_id: parseInt(userId) };
        const user = await Models.User.findOne(userQuery);

        if (!user) return c.json({ message: 'User not found' }, 404);

        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        let matchStage: any = { status: 'EXECUTED', distributor_id: user._id };

        if (startDate && endDate) {
            matchStage.created_at = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        const topProducts = await Models.Order.aggregate([
            { $match: matchStage },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.variant_id',
                    total_bought: { $sum: '$items.executed_qty' }
                }
            },
            {
                $lookup: {
                    from: 'variants',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'variant'
                }
            },
            { $unwind: '$variant' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'variant.product_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product._id',
                    product_name: { $first: '$product.name' },
                    total_bought: { $sum: '$total_bought' }
                }
            },
            { $sort: { total_bought: -1 } },
            { $limit: 5 },
            {
                $project: {
                    _id: 0,
                    product_name: 1,
                    total_bought: 1
                }
            }
        ]);

        return c.json(topProducts);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/transactions/detailed', async (c) => {
    try {
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        const month = c.req.query('month');
        const year = c.req.query('year');
        let matchStage: any = {};

        if (startDate && endDate) {
            matchStage.created_at = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        } else if (month && year) {
            const m = parseInt(month) - 1; 
            const y = parseInt(year);
            const startOfMonth = new Date(y, m, 1);
            const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);
            
            matchStage.created_at = {
                $gte: startOfMonth,
                $lte: endOfMonth
            };
        }

        const invoices = await Models.Invoice.find(matchStage)
            .sort({ created_at: -1 })
            .populate({
                path: 'order_id',
                populate: { path: 'distributor_id' }
            })
            .lean();

        const transactions = invoices.map((inv: any) => {
            const user = inv.order_id?.distributor_id || {};
            return {
                date: inv.created_at.toISOString().split('T')[0],
                invoice_number: inv.invoice_number,
                firm_name: user.firm_name,
                town: user.address,
                taxable_amount: inv.subtotal || 0,
                gst_amount: (inv.cgst_amount || 0) + (inv.sgst_amount || 0),
                total_amount: inv.grand_total || 0
            };
        });

        return c.json(transactions);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

export default router;
