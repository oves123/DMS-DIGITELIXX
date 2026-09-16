import { Hono } from 'hono';
import Models from '../db/models';
import { generateInvoicePdf } from '../services/pdfService';

const router = new Hono<{ Bindings: { MY_BUCKET: R2Bucket } }>();

function getQueryId(id: string, sqlField: string) {
    return isNaN(Number(id)) ? { _id: id } : { [sqlField]: parseInt(id) };
}

// GET /api/orders/admin
router.get('/admin', async (c) => {
    try {
        const orders = await Models.Order.find()
            .populate('distributor_id')
            .populate({
                path: 'items.variant_id',
                populate: { path: 'product_id', populate: { path: 'category_id' } }
            })
            .sort({ order_date: -1 })
            .lean();

        const orderIds = orders.map((o: any) => o._id);
        const invoices = await Models.Invoice.find({ order_id: { $in: orderIds } }).lean();
        
        const variantIds: any[] = [];
        orders.forEach((o: any) => o.items.forEach((i: any) => variantIds.push(i.variant_id?._id)));
        const inventory = await Models.Inventory.find({ variant_id: { $in: variantIds } }).lean();

        const invMap: any = {};
        invoices.forEach((inv: any) => invMap[inv.order_id.toString()] = inv);

        const stockMap: any = {};
        inventory.forEach((inv: any) => stockMap[inv.variant_id.toString()] = inv.stock_quantity);

        const formattedOrders = orders.map((row: any) => {
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
                items: row.items.map((item: any) => {
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

        return c.json(formattedOrders);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

// POST /api/orders
router.post('/', async (c) => {
    try {
        const { distributor_id, items, apply_wallet } = await c.req.json();
        
        const distQuery = getQueryId(distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(distQuery);
        
        if (!user) return c.json({ message: 'Distributor not found' }, 404);

        const newItems = [];
        for (let item of items) {
            const varQuery = getQueryId(item.variant_id, 'sql_variant_id');
            const variant = await Models.Variant.findOne(varQuery);
            if (variant) {
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

        return c.json({ message: 'Order submitted successfully', order_id: order._id.toString() }, 201);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to submit order' }, 500);
    }
});

// GET /api/orders/distributor/:user_id
router.get('/distributor/:user_id', async (c) => {
    try {
        const userId = c.req.param('user_id');
        const userQuery = getQueryId(userId, 'sql_user_id');
        const user = await Models.User.findOne(userQuery);

        if (!user) return c.json({ message: 'User not found' }, 404);

        const orders = await Models.Order.find({ distributor_id: user._id })
            .populate({
                path: 'items.variant_id',
                populate: { path: 'product_id', populate: { path: 'category_id' } }
            })
            .sort({ order_date: -1 })
            .lean();

        return c.json(orders.map((row: any) => ({
            order_id: row.sql_order_id || row._id.toString(),
            status: row.status,
            order_date: row.order_date,
            execution_date: row.execution_date,
            apply_wallet: row.apply_wallet,
            items: row.items.map((item: any) => {
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
        return c.json({ message: 'Server Error' }, 500);
    }
});

// PUT /api/orders/:id/execute
router.put('/:id/execute', async (c) => {
    try {
        const orderId = c.req.param('id');
        const { items, credit_applied = 0, extra_discount = 0, discount_reason = '' } = await c.req.json();
        
        const orderQuery = getQueryId(orderId, 'sql_order_id');
        const order = await Models.Order.findOne(orderQuery).populate('distributor_id');

        if (!order) return c.json({ message: 'Order not found' }, 404);
        if (order.status === 'EXECUTED') return c.json({ message: 'Order is already executed' }, 400);

        let subtotal = 0;
        let cgst = 0;
        let sgst = 0;

        for (let item of items) {
            if (item.executed_qty < 0) return c.json({ message: 'Executed quantity cannot be negative' }, 400);

            const orderItem = order.items.find((i: any) => 
                (i.sql_order_item_id == item.order_item_id) || (i._id.toString() == item.order_item_id)
            );

            if (!orderItem) return c.json({ message: `Order item ID ${item.order_item_id} not found.` }, 400);
            orderItem.executed_qty = item.executed_qty;

            const variant = await Models.Variant.findById(orderItem.variant_id);
            
            await Models.Inventory.findOneAndUpdate(
                { variant_id: variant._id },
                { $inc: { stock_quantity: -item.executed_qty } }
            );

            const product = await Models.Product.findById(variant.product_id);
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
        await order.save();

        let grand_total = subtotal + cgst + sgst;
        grand_total = grand_total - credit_applied - extra_discount;
        if (grand_total < 0) grand_total = 0;
        grand_total = Math.round(grand_total);

        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();
        let startYear = (month >= 3) ? year : year - 1;
        let endYear = startYear + 1;
        const fyString = `${startYear.toString().slice(-2)}${endYear.toString().slice(-2)}`;
        const invoicePrefix = `SS032-${fyString}-`;

        const lastInvoice = await Models.Invoice.findOne({ invoice_number: new RegExp(`^${invoicePrefix}`) })
            .sort({ invoice_number: -1 });

        let nextSeq = (fyString === '2627') ? 170 : 1;
        if (lastInvoice) {
            const parts = lastInvoice.invoice_number.split('-');
            nextSeq = parseInt(parts[parts.length - 1], 10) + 1;
        }

        const invoice_number = `${invoicePrefix}${String(nextSeq).padStart(4, '0')}`;

        const invoice = await Models.Invoice.create({
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
        });

        if (credit_applied > 0) {
            await Models.User.findByIdAndUpdate(
                order.distributor_id,
                { $inc: { wallet_balance: -credit_applied } }
            );
        }

        c.executionCtx.waitUntil(
            (async () => {
              try {
                const invoiceData = {
                  invoice: { ...invoice.toObject(), firm_name: (order.distributor_id as any).firm_name, address: (order.distributor_id as any).address, owner_name: (order.distributor_id as any).owner_name },
                  items: items.filter((i: any) => i.executed_qty > 0) // note: items structure may need fixing to match generateInvoicePdf
                };
                // Quick fix to match generateInvoicePdf expected items
                const fullItems = [];
                for (const it of invoiceData.items) {
                     const oi = order.items.find((x: any) => (x.sql_order_item_id == it.order_item_id) || (x._id.toString() == it.order_item_id));
                     const variant = await Models.Variant.findById(oi.variant_id).populate('product_id');
                     fullItems.push({
                        product_name: (variant.product_id as any).name,
                        executed_qty: it.executed_qty,
                        price_at_order: oi.unit_price
                     });
                }
                invoiceData.items = fullItems;
                const settings = await Models.CompanySettings.findOne() || {};
                const pdfUrl = await generateInvoicePdf(invoiceData, settings, c.env.MY_BUCKET as any);
                invoice.pdf_url = pdfUrl;
                await invoice.save();
              } catch (pdfError) {
                console.error('Failed to generate PDF:', pdfError);
              }
            })()
        );

        return c.json({ message: 'Order executed and invoice generated successfully' });
    } catch (err: any) {
        console.error(err);
        return c.json({ message: err.message || 'Failed to execute order' }, 500);
    }
});

// PUT /api/orders/:id
router.put('/:id', async (c) => {
    try {
        const orderId = c.req.param('id');
        const { items } = await c.req.json();
        
        const orderQuery = getQueryId(orderId, 'sql_order_id');
        const order = await Models.Order.findOne(orderQuery);

        if (!order) return c.json({ message: 'Order not found' }, 404);
        if (order.status !== 'PENDING') return c.json({ message: 'Only PENDING orders can be edited' }, 400);

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

        return c.json({ message: 'Order updated successfully', order_id: order._id.toString() });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to update order' }, 500);
    }
});

// POST /api/orders/:id/draft-pdf
router.post('/:id/draft-pdf', async (c) => {
    try {
        const orderId = c.req.param('id');
        const { items, credit_applied = 0, extra_discount = 0 } = await c.req.json();
        
        const orderQuery = getQueryId(orderId, 'sql_order_id');
        const order = await Models.Order.findOne(orderQuery).populate('distributor_id');
            
        if (!order) return c.json({ message: 'Order not found' }, 404);
        
        const settings = await Models.CompanySettings.findOne() || {};

        let subtotal = 0;
        let cgst = 0;
        let sgst = 0;
        const invoiceItems = [];

        for (let item of items) {
            const orderItem = order.items.find((i: any) => 
                (i.sql_order_item_id == item.order_item_id) || (i._id.toString() == item.order_item_id)
            );
            
            if (orderItem) {
                const variant = await Models.Variant.findById(orderItem.variant_id).populate({ path: 'product_id', populate: { path: 'category_id' } }) as any;
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
            firm_name: (order.distributor_id as any).firm_name,
            owner_name: (order.distributor_id as any).owner_name,
            address: (order.distributor_id as any).address,
            fssai_number: (order.distributor_id as any).fssai_number,
            invoice_number: `DRAFT-${orderId}`,
            created_at: new Date(),
            subtotal,
            cgst_amount: cgst,
            sgst_amount: sgst,
            grand_total,
            extra_discount
        };

        const pdfUrl = await generateInvoicePdf({ invoice, items: invoiceItems }, settings, c.env.MY_BUCKET as any);
        
        const file = await c.env.MY_BUCKET.get(pdfUrl);
        if (!file) {
            return c.json({ message: 'File not found on server' }, 404);
        }

        c.header('Content-Type', 'application/pdf');
        c.header('Content-Disposition', `attachment; filename="Draft_Bill_${orderId}.pdf"`);
        return c.body(file.body);
        
    } catch (err: any) {
        console.error(err);
        return c.json({ message: err.message || 'Failed to generate draft bill' }, 500);
    }
});

export default router;
