const mongoose = require('mongoose');
const Models = require('../mongoModels/index');
const { generateInvoicePdf } = require('../services/pdfService');
const path = require('path');
const fs = require('fs');

// Helper to determine if ID is mongo ObjectId or SQL integer
function getQueryId(id, sqlField) {
    return isNaN(id) ? { _id: id } : { [sqlField]: id };
}

// GET /api/orders
exports.getAdminOrders = async (req, res) => {
    try {
        const orders = await Models.Order.find()
            .populate('distributor_id')
            .populate({
                path: 'items.variant_id',
                populate: { path: 'product_id', populate: { path: 'category_id' } }
            })
            .sort({ order_date: -1 })
            .lean();

        // We also need to attach Inventory and Invoices
        // Mongoose doesn't support left join easily with populate for non-ref fields unless we use aggregation
        // We will fetch them separately and map
        const orderIds = orders.map(o => o._id);
        const invoices = await Models.Invoice.find({ order_id: { $in: orderIds } }).lean();
        
        const variantIds = [];
        orders.forEach(o => o.items.forEach(i => variantIds.push(i.variant_id?._id)));
        const inventory = await Models.Inventory.find({ variant_id: { $in: variantIds } }).lean();

        const invMap = {};
        invoices.forEach(inv => invMap[inv.order_id.toString()] = inv);

        const stockMap = {};
        inventory.forEach(inv => stockMap[inv.variant_id.toString()] = inv.stock_quantity);

        const formattedOrders = orders.map(row => {
            const invoice = invMap[row._id.toString()] || {};
            
            return {
                order_id: row.sql_order_id || row._id.toString(),
                distributor_name: row.distributor_id?.firm_name,
                distributor_phone: row.distributor_id?.phone,
                wallet_balance: row.distributor_id?.wallet_balance || 0,
                status: row.status,
                order_date: row.order_date,
                execution_date: row.execution_date,
                apply_wallet: row.apply_wallet,
                credit_applied: invoice.credit_applied || 0,
                extra_discount: invoice.extra_discount || 0,
                final_payable: invoice.grand_total || 0,
                items: row.items.map(item => {
                    const variant = item.variant_id || {};
                    const product = variant.product_id || {};
                    const category = product.category_id || {};
                    
                    return {
                        order_item_id: item.sql_order_item_id || item._id.toString(),
                        variant_id: variant.sql_variant_id || variant._id?.toString(),
                        product_name: product.name,
                        hsn_code: product.hsn_code,
                        gst_percent: parseFloat(product.gst_percent) || 0,
                        uom: variant.uom || 'Box',
                        category_name: category.name || 'Uncategorized',
                        pack_size: variant.pack_size,
                        requested_qty: item.quantity,
                        executed_qty: item.executed_qty,
                        price_at_order: item.unit_price,
                        current_stock: stockMap[variant._id?.toString()] || 0
                    };
                })
            };
        });

        res.json(formattedOrders);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// PUT /api/orders/:id/execute
exports.executeOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const orderId = req.params.id;
        const { items, credit_applied = 0, extra_discount = 0, discount_reason = '' } = req.body;
        
        const orderQuery = getQueryId(orderId, 'sql_order_id');
        const order = await Models.Order.findOne(orderQuery).session(session);

        if (!order) throw new Error('Order not found');
        if (order.status === 'EXECUTED') throw new Error('Order is already executed');

        let subtotal = 0;
        let cgst = 0;
        let sgst = 0;

        for (let item of items) {
            if (item.executed_qty < 0) throw new Error('Executed quantity cannot be negative');

            const orderItem = order.items.find(i => 
                (i.sql_order_item_id == item.order_item_id) || (i._id.toString() == item.order_item_id)
            );

            if (!orderItem) throw new Error(`Order item ID ${item.order_item_id} not found.`);
            orderItem.executed_qty = item.executed_qty;

            // Deduct Inventory
            const variant = await Models.Variant.findById(orderItem.variant_id).session(session);
            
            await Models.Inventory.findOneAndUpdate(
                { variant_id: variant._id },
                { $inc: { stock_quantity: -item.executed_qty } },
                { session }
            );

            // Calculate GST
            const product = await Models.Product.findById(variant.product_id).session(session);
            const price = orderItem.unit_price;
            const gstPct = parseFloat(product.gst_percent) || 0;
            
            const itemSubtotal = price * item.executed_qty;
            subtotal += itemSubtotal;
            
            const halfGst = gstPct / 2;
            cgst += itemSubtotal * (halfGst / 100);
            sgst += itemSubtotal * (halfGst / 100);
        }

        order.status = 'EXECUTED';
        order.execution_date = new Date();
        await order.save({ session });

        // Invoice Logic
        let grand_total = subtotal + cgst + sgst;
        grand_total = grand_total - credit_applied - extra_discount;
        if (grand_total < 0) grand_total = 0;
        grand_total = Math.round(grand_total);

        // Generate Invoice Number SS032-YYXX-XXXX
        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();
        let startYear = (month >= 3) ? year : year - 1;
        let endYear = startYear + 1;
        const fyString = `${startYear.toString().slice(-2)}${endYear.toString().slice(-2)}`;
        const invoicePrefix = `SS032-${fyString}-`;

        const lastInvoice = await Models.Invoice.findOne({ invoice_number: new RegExp(`^${invoicePrefix}`) })
            .sort({ invoice_number: -1 })
            .session(session);

        let nextSeq = (fyString === '2627') ? 170 : 1;
        if (lastInvoice) {
            const parts = lastInvoice.invoice_number.split('-');
            nextSeq = parseInt(parts[parts.length - 1], 10) + 1;
        }

        const invoice_number = `${invoicePrefix}${String(nextSeq).padStart(4, '0')}`;

        await Models.Invoice.create([{
            order_id: order._id,
            invoice_number,
            subtotal,
            cgst_amount: cgst,
            sgst_amount: sgst,
            grand_total,
            credit_applied,
            extra_discount,
            discount_reason,
            payment_status: 'UNPAID'
        }], { session });

        // Deduct Wallet
        if (credit_applied > 0) {
            await Models.User.findByIdAndUpdate(
                order.distributor_id,
                { $inc: { wallet_balance: -credit_applied } },
                { session }
            );
        }

        await session.commitTransaction();
        res.json({ message: 'Order executed and invoice generated successfully' });

    } catch (err) {
        console.error(err);
        await session.abortTransaction();
        res.status(500).json({ message: err.message || 'Failed to execute order' });
    } finally {
        session.endSession();
    }
};

// POST /api/orders
exports.createOrder = async (req, res) => {
    try {
        const { distributor_id, items, apply_wallet } = req.body;
        
        const distQuery = getQueryId(distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(distQuery);
        
        if (!user) return res.status(404).json({ message: 'Distributor not found' });

        const newItems = [];
        for (let item of items) {
            const varQuery = getQueryId(item.variant_id, 'sql_variant_id');
            const variant = await Models.Variant.findOne(varQuery);
            if(variant) {
                newItems.push({
                    product_id: variant.product_id,
                    variant_id: variant._id,
                    quantity: item.requested_qty,
                    unit_price: item.price_at_order
                });
            }
        }

        const order = await Models.Order.create({
            distributor_id: user._id,
            status: 'PENDING',
            apply_wallet: apply_wallet || false,
            items: newItems
        });

        res.json({ message: 'Order submitted successfully', order_id: order._id.toString() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to submit order' });
    }
};

// GET /api/orders/distributor/:user_id
exports.getDistributorOrders = async (req, res) => {
    try {
        const userId = req.params.user_id;
        const userQuery = getQueryId(userId, 'sql_user_id');
        const user = await Models.User.findOne(userQuery);

        if (!user) return res.status(404).json({ message: 'User not found' });

        const orders = await Models.Order.find({ distributor_id: user._id })
            .populate({
                path: 'items.variant_id',
                populate: { path: 'product_id', populate: { path: 'category_id' } }
            })
            .sort({ order_date: -1 })
            .lean();

        res.json(orders.map(row => ({
            order_id: row.sql_order_id || row._id.toString(),
            status: row.status,
            order_date: row.order_date,
            execution_date: row.execution_date,
            apply_wallet: row.apply_wallet,
            items: row.items.map(item => {
                const variant = item.variant_id || {};
                const product = variant.product_id || {};
                const category = product.category_id || {};
                return {
                    order_item_id: item.sql_order_item_id || item._id.toString(),
                    variant_id: variant.sql_variant_id || variant._id?.toString(),
                    product_name: product.name,
                    hsn_code: product.hsn_code,
                    gst_percent: parseFloat(product.gst_percent) || 0,
                    uom: variant.uom || 'Box',
                    category_name: category.name || 'Uncategorized',
                    pack_size: variant.pack_size,
                    requested_qty: item.quantity,
                    executed_qty: item.executed_qty,
                    price_at_order: item.unit_price
                };
            })
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// PUT /api/orders/:id
exports.updateOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { items } = req.body;
        
        const orderQuery = getQueryId(orderId, 'sql_order_id');
        const order = await Models.Order.findOne(orderQuery);

        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.status !== 'PENDING') return res.status(400).json({ message: 'Only PENDING orders can be edited' });

        const newItems = [];
        for (let item of items) {
            const varQuery = getQueryId(item.variant_id, 'sql_variant_id');
            const variant = await Models.Variant.findOne(varQuery);
            if(variant) {
                newItems.push({
                    product_id: variant.product_id,
                    variant_id: variant._id,
                    quantity: item.requested_qty,
                    unit_price: item.price_at_order
                });
            }
        }

        order.items = newItems;
        await order.save();

        res.json({ message: 'Order updated successfully', order_id: order._id.toString() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update order' });
    }
};

// POST /api/orders/:id/draft-pdf
exports.generateDraftPdf = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { items, credit_applied = 0, extra_discount = 0 } = req.body;
        
        const orderQuery = getQueryId(orderId, 'sql_order_id');
        const order = await Models.Order.findOne(orderQuery).populate('distributor_id');
            
        if (!order) return res.status(404).json({ message: 'Order not found' });
        
        const settings = await Models.CompanySettings.findOne() || {};

        let subtotal = 0;
        let cgst = 0;
        let sgst = 0;
        const invoiceItems = [];

        for (let item of items) {
            const orderItem = order.items.find(i => 
                (i.sql_order_item_id == item.order_item_id) || (i._id.toString() == item.order_item_id)
            );
            
            if (orderItem) {
                const variant = await Models.Variant.findById(orderItem.variant_id).populate({ path: 'product_id', populate: { path: 'category_id' } });
                const product = variant.product_id;
                
                const price = orderItem.unit_price;
                const gstPct = parseFloat(product.gst_percent) || 0;
                
                const itemSubtotal = price * item.executed_qty;
                subtotal += itemSubtotal;
                
                const halfGst = gstPct / 2;
                cgst += itemSubtotal * (halfGst / 100);
                sgst += itemSubtotal * (halfGst / 100);
                
                invoiceItems.push({
                    category_name: product.category_id?.name,
                    executed_qty: item.executed_qty,
                    price_at_order: price,
                    hsn_code: product.hsn_code,
                    product_name: product.name,
                    pack_size: variant.pack_size,
                    uom: variant.uom,
                    gst_percent: product.gst_percent
                });
            }
        }

        let grand_total = subtotal + cgst + sgst;
        grand_total = grand_total - credit_applied - extra_discount;
        if (grand_total < 0) grand_total = 0;
        grand_total = Math.round(grand_total);
        
        const invoice = {
            firm_name: order.distributor_id.firm_name,
            owner_name: order.distributor_id.owner_name,
            address: order.distributor_id.address,
            fssai_number: order.distributor_id.fssai_number,
            invoice_number: `DRAFT-${orderId}`,
            created_at: new Date(),
            subtotal,
            cgst_amount: cgst,
            sgst_amount: sgst,
            grand_total,
            extra_discount
        };

        const pdfUrl = await generateInvoicePdf({ invoice, items: invoiceItems }, settings);
        
        const pdfPath = path.join(__dirname, '../', pdfUrl);
        if (fs.existsSync(pdfPath)) {
            res.download(pdfPath, `Draft_Bill_${orderId}.pdf`);
        } else {
            res.status(500).json({ message: 'Failed to generate PDF file' });
        }
        
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message || 'Failed to generate draft bill' });
    }
};
