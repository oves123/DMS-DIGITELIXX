import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, or, inArray, desc, like } from 'drizzle-orm';
import * as schema from '../db/schema';
import { generateInvoicePdf } from '../services/pdfService';
import type { Env } from '../index';

const router = new Hono<{ Bindings: Env }>();

// GET /api/orders/admin
router.get('/admin', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        const orders = await db.select().from(schema.orders).orderBy(desc(schema.orders.order_date));
        
        const orderIds = orders.map(o => o.id);
        
        let orderItems: any[] = [];
        let invoices: any[] = [];
        if (orderIds.length > 0) {
            for (let i = 0; i < orderIds.length; i += 90) {
                const chunk = orderIds.slice(i, i + 90);
                const itemsChunk = await db.select().from(schema.orderItems).where(inArray(schema.orderItems.order_id, chunk));
                orderItems.push(...itemsChunk);
                
                const invChunk = await db.select().from(schema.invoices).where(inArray(schema.invoices.order_id, chunk));
                invoices.push(...invChunk);
            }
        }

        const users = await db.select().from(schema.users);
        const variants = await db.select().from(schema.variants);
        const products = await db.select().from(schema.products);
        const categories = await db.select().from(schema.categories);
        const inventory = await db.select().from(schema.inventory);

        const userMap: any = {}; users.forEach(u => userMap[u.id] = u);
        const varMap: any = {}; variants.forEach(v => varMap[v.id] = v);
        const prodMap: any = {}; products.forEach(p => prodMap[p.id] = p);
        const catMap: any = {}; categories.forEach(cat => catMap[cat.id] = cat);
        const stockMap: any = {}; inventory.forEach(inv => stockMap[inv.variant_id] = inv.stock_quantity);
        const invMap: any = {}; invoices.forEach(inv => invMap[inv.order_id] = inv);

        const itemsByOrder: any = {};
        orderItems.forEach(item => {
            if(!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
            itemsByOrder[item.order_id].push(item);
        });

        const formattedOrders = orders.map(row => {
            const invoice = invMap[row.id] || {};
            const dist = userMap[row.distributor_id] || {};
            const items = itemsByOrder[row.id] || [];
            
            return {
                order_id: row.sql_order_id || row.id,
                distributor_name: dist.firm_name,
                distributor_phone: dist.phone,
                wallet_balance: dist.wallet_balance || 0,
                status: row.status,
                order_date: row.order_date,
                execution_date: row.execution_date,
                apply_wallet: row.apply_wallet,
                credit_applied: invoice.credit_applied || 0,
                extra_discount: invoice.extra_discount || 0,
                final_payable: invoice.grand_total || 0,
                items: items.map((item: any) => {
                    const variant = varMap[item.variant_id] || {};
                    const product = prodMap[item.product_id] || {};
                    const category = catMap[product.category_id] || {};
                    
                    return {
                        order_item_id: item.sql_order_item_id || item.id,
                        variant_id: variant.sql_variant_id || variant.id,
                        product_name: product.name,
                        hsn_code: product.hsn_code,
                        gst_percent: product.gst_percent || 0,
                        uom: variant.uom || 'Box',
                        category_name: category.name || 'Uncategorized',
                        pack_size: variant.pack_size,
                        requested_qty: item.quantity,
                        executed_qty: item.executed_qty,
                        price_at_order: item.unit_price,
                        current_stock: stockMap[variant.id] || 0
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
        const db = drizzle(c.env.DB, { schema });

        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, distributor_id), eq(schema.users.sql_user_id, parseInt(distributor_id)))
        });
        
        if (!user) return c.json({ message: 'Distributor not found' }, 404);

        const orderId = crypto.randomUUID();
        
        const lastOrder = await db.select().from(schema.orders).orderBy(desc(schema.orders.sql_order_id)).limit(1);
        let nextSqlOrderId = 1;
        if (lastOrder.length > 0 && lastOrder[0].sql_order_id) {
            nextSqlOrderId = lastOrder[0].sql_order_id + 1;
        }

        const newItems: any[] = [];
        
        for (let item of items) {
            let condition;
            const strId = String(item.variant_id);
            if (/^\d+$/.test(strId)) {
                // It's a purely numeric ID (sql_variant_id)
                condition = or(eq(schema.variants.id, strId), eq(schema.variants.sql_variant_id, parseInt(strId, 10)));
            } else {
                // It's a UUID
                condition = eq(schema.variants.id, strId);
            }

            const variant = await db.query.variants.findFirst({
                where: condition
            });

            if (variant) {
                newItems.push({
                    id: crypto.randomUUID(),
                    order_id: orderId,
                    product_id: variant.product_id,
                    variant_id: variant.id,
                    quantity: item.requested_qty,
                    unit_price: item.price_at_order
                });
            }
        }

        await db.insert(schema.orders).values({
            id: orderId,
            sql_order_id: nextSqlOrderId,
            distributor_id: user.id,
            status: 'PENDING',
            apply_wallet: apply_wallet || false,
            order_date: new Date(),
            created_at: new Date()
        });

        if (newItems.length > 0) {
            await db.insert(schema.orderItems).values(newItems);
        }

        return c.json({ message: 'Order submitted successfully', order_id: orderId }, 201);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to submit order' }, 500);
    }
});

// GET /api/orders/distributor/:user_id
router.get('/distributor/:user_id', async (c) => {
    try {
        const userId = c.req.param('user_id');
        const db = drizzle(c.env.DB, { schema });
        
        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, userId), eq(schema.users.sql_user_id, parseInt(userId)))
        });

        if (!user) return c.json({ message: 'User not found' }, 404);

        const orders = await db.select().from(schema.orders).where(eq(schema.orders.distributor_id, user.id)).orderBy(desc(schema.orders.order_date));
        const orderIds = orders.map(o => o.id);
        
        let orderItems: any[] = [];
        if (orderIds.length > 0) {
            for (let i = 0; i < orderIds.length; i += 90) {
                const chunk = orderIds.slice(i, i + 90);
                const itemsChunk = await db.select().from(schema.orderItems).where(inArray(schema.orderItems.order_id, chunk));
                orderItems.push(...itemsChunk);
            }
        }

        const variants = await db.select().from(schema.variants);
        const products = await db.select().from(schema.products);
        const categories = await db.select().from(schema.categories);

        const varMap: any = {}; variants.forEach(v => varMap[v.id] = v);
        const prodMap: any = {}; products.forEach(p => prodMap[p.id] = p);
        const catMap: any = {}; categories.forEach(cat => catMap[cat.id] = cat);

        const itemsByOrder: any = {};
        orderItems.forEach(item => {
            if(!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
            itemsByOrder[item.order_id].push(item);
        });

        return c.json(orders.map(row => {
            const items = itemsByOrder[row.id] || [];
            return {
                order_id: row.sql_order_id || row.id,
                status: row.status,
                order_date: row.order_date,
                execution_date: row.execution_date,
                apply_wallet: row.apply_wallet,
                items: items.map((item: any) => {
                    const variant = varMap[item.variant_id] || {};
                    const product = prodMap[item.product_id] || {};
                    const category = catMap[product.category_id] || {};
                    return {
                        order_item_id: item.sql_order_item_id || item.id,
                        variant_id: variant.sql_variant_id || variant.id,
                        product_name: product.name,
                        hsn_code: product.hsn_code,
                        gst_percent: product.gst_percent || 0,
                        uom: variant.uom || 'Box',
                        category_name: category.name || 'Uncategorized',
                        pack_size: variant.pack_size,
                        requested_qty: item.quantity,
                        executed_qty: item.executed_qty,
                        price_at_order: item.unit_price
                    };
                })
            };
        }));
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

// PUT /api/orders/:id/execute
router.put('/:id/execute', async (c) => {
    try {
        const orderIdParam = c.req.param('id');
        const { items, credit_applied = 0, extra_discount = 0, discount_reason = '' } = await c.req.json();
        
        const db = drizzle(c.env.DB, { schema });
        const order = await db.query.orders.findFirst({
            where: or(eq(schema.orders.id, orderIdParam), eq(schema.orders.sql_order_id, parseInt(orderIdParam)))
        });

        if (!order) return c.json({ message: 'Order not found' }, 404);
        if (order.status === 'EXECUTED') return c.json({ message: 'Order is already executed' }, 400);

        const orderItems = await db.select().from(schema.orderItems).where(eq(schema.orderItems.order_id, order.id));
        const user = await db.query.users.findFirst({ where: eq(schema.users.id, order.distributor_id) });

        let subtotal = 0;
        let cgst = 0;
        let sgst = 0;

        for (let item of items) {
            if (item.executed_qty < 0) return c.json({ message: 'Executed quantity cannot be negative' }, 400);

            const orderItem = orderItems.find((i: any) => 
                (i.sql_order_item_id == item.order_item_id) || (i.id == item.order_item_id)
            );

            if (!orderItem) return c.json({ message: `Order item ID ${item.order_item_id} not found.` }, 400);
            
            await db.update(schema.orderItems).set({ executed_qty: item.executed_qty }).where(eq(schema.orderItems.id, orderItem.id));

            const variant = await db.query.variants.findFirst({ where: eq(schema.variants.id, orderItem.variant_id) }) as any;
            
            const inv = await db.query.inventory.findFirst({ where: eq(schema.inventory.variant_id, variant.id) });
            if (inv) {
                await db.update(schema.inventory).set({ stock_quantity: (inv.stock_quantity || 0) - item.executed_qty }).where(eq(schema.inventory.id, inv.id));
            }

            const product = await db.query.products.findFirst({ where: eq(schema.products.id, variant.product_id) }) as any;
            const price = orderItem.unit_price;
            const gstPct = product.gst_percent || 0;
            
            const itemSubtotal = price * item.executed_qty;
            subtotal += itemSubtotal;
            
            const halfGst = gstPct / 2;
            cgst += itemSubtotal * (halfGst / 100);
            sgst += itemSubtotal * (halfGst / 100);
        }

        await db.update(schema.orders).set({ status: 'EXECUTED', execution_date: new Date() }).where(eq(schema.orders.id, order.id));

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

        // Wait, D1 SQLite doesn't have regex like Mongo. We use LIKE.
        const lastInvoices = await db.select().from(schema.invoices)
            .where(like(schema.invoices.invoice_number, `${invoicePrefix}%`));
            
        let nextSeq = (fyString === '2627') ? 170 : 1;
        if (lastInvoices.length > 0) {
            // Sort to find max
            lastInvoices.sort((a, b) => b.invoice_number.localeCompare(a.invoice_number));
            const parts = lastInvoices[0].invoice_number.split('-');
            nextSeq = parseInt(parts[parts.length - 1], 10) + 1;
        }

        const invoice_number = `${invoicePrefix}${String(nextSeq).padStart(4, '0')}`;
        const invoiceId = crypto.randomUUID();

        await db.insert(schema.invoices).values({
            id: invoiceId,
            order_id: order.id,
            invoice_number,
            subtotal,
            cgst_amount: cgst,
            sgst_amount: sgst,
            grand_total,
            credit_applied,
            extra_discount,
            discount_reason,
            payment_status: 'UNPAID',
            created_at: new Date()
        });

        if (credit_applied > 0 && user) {
            await db.update(schema.users).set({ wallet_balance: (user.wallet_balance || 0) - credit_applied }).where(eq(schema.users.id, user.id));
        }

        c.executionCtx.waitUntil(
            (async () => {
              try {
                const invoice = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
                const invoiceData = {
                  invoice: { ...invoice, firm_name: user?.firm_name, address: user?.address, owner_name: user?.owner_name },
                  items: [] as any[]
                };
                
                for (const it of items) {
                     if (it.executed_qty <= 0) continue;
                     const oi = orderItems.find((x: any) => (x.sql_order_item_id == it.order_item_id) || (x.id == it.order_item_id));
                     if (!oi) continue;
                     const variant = await db.query.variants.findFirst({ where: eq(schema.variants.id, oi.variant_id) }) as any;
                     const prod = await db.query.products.findFirst({ where: eq(schema.products.id, variant.product_id) }) as any;
                     invoiceData.items.push({
                        product_name: prod.name,
                        executed_qty: it.executed_qty,
                        price_at_order: oi.unit_price
                     });
                }
                const settings = await db.query.companySettings.findFirst() || {};
                const pdfUrl = await generateInvoicePdf(invoiceData, settings, c.env.MY_BUCKET as any);
                await db.update(schema.invoices).set({ pdf_url: pdfUrl }).where(eq(schema.invoices.id, invoiceId));
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
        const orderIdParam = c.req.param('id');
        const { items } = await c.req.json();
        const db = drizzle(c.env.DB, { schema });
        
        const order = await db.query.orders.findFirst({
            where: or(eq(schema.orders.id, orderIdParam), eq(schema.orders.sql_order_id, parseInt(orderIdParam)))
        });

        if (!order) return c.json({ message: 'Order not found' }, 404);
        if (order.status !== 'PENDING') return c.json({ message: 'Only PENDING orders can be edited' }, 400);

        // Delete existing items
        await db.delete(schema.orderItems).where(eq(schema.orderItems.order_id, order.id));

        const newItems: any[] = [];
        for (let item of items) {
            let condition;
            const strId = String(item.variant_id);
            if (/^\d+$/.test(strId)) {
                condition = or(eq(schema.variants.id, strId), eq(schema.variants.sql_variant_id, parseInt(strId, 10)));
            } else {
                condition = eq(schema.variants.id, strId);
            }

            const variant = await db.query.variants.findFirst({
                where: condition
            });
            if(variant) {
                newItems.push({
                    id: crypto.randomUUID(),
                    order_id: order.id,
                    product_id: variant.product_id,
                    variant_id: variant.id,
                    quantity: item.requested_qty,
                    unit_price: item.price_at_order
                });
            }
        }

        if (newItems.length > 0) {
            await db.insert(schema.orderItems).values(newItems);
        }

        return c.json({ message: 'Order updated successfully', order_id: order.id });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to update order' }, 500);
    }
});

router.post('/:id/draft-pdf', async (c) => {
    try {
        const orderIdParam = c.req.param('id');
        const { items, credit_applied = 0, extra_discount = 0 } = await c.req.json();
        const db = drizzle(c.env.DB, { schema });
        
        const order = await db.query.orders.findFirst({
            where: or(eq(schema.orders.id, orderIdParam), eq(schema.orders.sql_order_id, parseInt(orderIdParam)))
        });
            
        if (!order) return c.json({ message: 'Order not found' }, 404);
        
        const user = await db.query.users.findFirst({ where: eq(schema.users.id, order.distributor_id) });
        const settings = await db.query.companySettings.findFirst() || {};

        let subtotal = 0;
        let cgst = 0;
        let sgst = 0;
        const invoiceItems = [];

        const orderItems = await db.select().from(schema.orderItems).where(eq(schema.orderItems.order_id, order.id));

        for (let item of items) {
            const orderItem = orderItems.find((i: any) => 
                (i.sql_order_item_id == item.order_item_id) || (i.id == item.order_item_id)
            );
            
            if (orderItem) {
                const variant = await db.query.variants.findFirst({ where: eq(schema.variants.id, orderItem.variant_id) }) as any;
                const product = await db.query.products.findFirst({ where: eq(schema.products.id, variant.product_id) }) as any;
                const category = await db.query.categories.findFirst({ where: eq(schema.categories.id, product.category_id) }) as any;
                
                const price = orderItem.unit_price;
                const gstPct = product.gst_percent || 0;
                
                const itemSubtotal = price * item.executed_qty;
                subtotal += itemSubtotal;
                
                const halfGst = gstPct / 2;
                cgst += itemSubtotal * (halfGst / 100);
                sgst += itemSubtotal * (halfGst / 100);
                
                invoiceItems.push({
                    category_name: category?.name,
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
            firm_name: user?.firm_name,
            owner_name: user?.owner_name,
            address: user?.address,
            fssai_number: null,
            invoice_number: `DRAFT-${order.id}`,
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
        c.header('Content-Disposition', `attachment; filename="Draft_Bill_${order.id}.pdf"`);
        return c.body(file.body as any);
        
    } catch (err: any) {
        console.error(err);
        return c.json({ message: err.message || 'Failed to generate draft bill' }, 500);
    }
});

export default router;
