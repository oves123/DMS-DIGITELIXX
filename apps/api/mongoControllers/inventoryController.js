const Models = require('../mongoModels/index');
const mongoose = require('mongoose');

function getQueryId(id, sqlField) {
    return isNaN(id) ? { _id: id } : { [sqlField]: parseInt(id) };
}

// GET /api/inventory
exports.getInventory = async (req, res) => {
    try {
        const products = await Models.Product.find().populate('category_id').lean();
        const variants = await Models.Variant.find().lean();
        const inventories = await Models.Inventory.find().lean();

        const inventoryMap = {};

        products.forEach(p => {
            inventoryMap[p._id.toString()] = {
                product_id: p.sql_product_id || p._id.toString(),
                name: p.name,
                category_id: p.category_id?.sql_category_id || p.category_id?._id?.toString(),
                category_name: p.category_id?.name,
                variants: []
            };
        });

        variants.forEach(v => {
            if (inventoryMap[v.product_id.toString()]) {
                const inv = inventories.find(i => i.variant_id.toString() === v._id.toString());
                inventoryMap[v.product_id.toString()].variants.push({
                    variant_id: v.sql_variant_id || v._id.toString(),
                    pack_size: v.pack_size,
                    distributor_rate: v.distributor_rate,
                    current_stock: inv ? inv.stock_quantity : 0,
                    low_stock_threshold: inv ? (inv.low_stock_threshold || 5) : 5
                });
            }
        });

        res.json(Object.values(inventoryMap));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// POST /api/inventory/update
exports.updateStock = async (req, res) => {
    try {
        const { variant_id, added_qty } = req.body;

        if (!added_qty || isNaN(added_qty)) {
            return res.status(400).json({ message: 'Invalid quantity' });
        }

        const vQuery = getQueryId(variant_id, 'sql_variant_id');
        const variant = await Models.Variant.findOne(vQuery);
        if (!variant) return res.status(404).json({ message: 'Variant not found' });

        let inv = await Models.Inventory.findOne({ variant_id: variant._id });
        if (inv) {
            inv.stock_quantity += parseInt(added_qty);
            await inv.save();
        } else {
            inv = await Models.Inventory.create({
                variant_id: variant._id,
                stock_quantity: parseInt(added_qty),
                low_stock_threshold: 5
            });
        }

        res.json({ message: 'Stock updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update stock' });
    }
};

// PUT /api/inventory/inline/:variant_id
exports.updateStockInline = async (req, res) => {
    try {
        const variant_id = req.params.variant_id;
        const { current_stock, low_stock_threshold } = req.body;

        const vQuery = getQueryId(variant_id, 'sql_variant_id');
        const variant = await Models.Variant.findOne(vQuery);
        if (!variant) return res.status(404).json({ message: 'Variant not found' });

        let inv = await Models.Inventory.findOne({ variant_id: variant._id });
        if (inv) {
            if (current_stock !== undefined) inv.stock_quantity = parseInt(current_stock);
            if (low_stock_threshold !== undefined) inv.low_stock_threshold = parseInt(low_stock_threshold);
            await inv.save();
        } else {
            await Models.Inventory.create({
                variant_id: variant._id,
                stock_quantity: current_stock !== undefined ? parseInt(current_stock) : 0,
                low_stock_threshold: low_stock_threshold !== undefined ? parseInt(low_stock_threshold) : 5
            });
        }

        res.json({ message: 'Inventory updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update inventory inline' });
    }
};
