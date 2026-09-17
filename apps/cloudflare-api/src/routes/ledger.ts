import { Hono } from 'hono';
import Models from '../db/models';
import { generateInvoicePdf, generateLedgerPdf, generateCreditNotePdf } from '../services/pdfService';

const router = new Hono<{ Bindings: { MY_BUCKET: R2Bucket } }>();

function getQueryId(id: string, sqlField: string) {
    return isNaN(Number(id)) ? { _id: id } : { [sqlField]: parseInt(id) };
}

// GET /api/ledger
router.get('/', async (c) => {
    try {
        const users = await Models.User.find({ role: { $in: ['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'] } }).lean();
        const userIds = users.map((u: any) => u._id);
        
        const orders = await Models.Order.find({ distributor_id: { $in: userIds } }).lean();
        const orderIds = orders.map((o: any) => o._id);
        
        const invoices = await Models.Invoice.find({ order_id: { $in: orderIds } }).sort({ created_at: -1 }).lean();
        
        const userMap: any = {};
        users.forEach((u: any) => {
            userMap[u._id.toString()] = {
                distributor_id: u.sql_user_id || u._id.toString(),
                firm_name: u.firm_name,
                wallet_balance: u.wallet_balance || 0,
                total_invoices: 0,
                total_billed: 0,
                total_paid: 0,
                total_pending: 0,
                invoices: []
            };
        });

        const orderToUser: any = {};
        orders.forEach((o: any) => {
            orderToUser[o._id.toString()] = o.distributor_id.toString();
        });

        invoices.forEach((inv: any) => {
            const distIdStr = orderToUser[inv.order_id.toString()];
            if (distIdStr && userMap[distIdStr]) {
                const mapEntry = userMap[distIdStr];
                mapEntry.total_invoices += 1;
                mapEntry.total_billed += inv.grand_total;
                mapEntry.total_paid += (inv.paid_amount || 0);
                mapEntry.total_pending += (inv.grand_total - (inv.paid_amount || 0));
                
                mapEntry.invoices.push({
                    invoice_number: inv.invoice_number,
                    invoice_id: inv.sql_invoice_id || inv._id.toString(),
                    subtotal: inv.subtotal,
                    cgst_amount: inv.cgst_amount,
                    sgst_amount: inv.sgst_amount,
                    grand_total: inv.grand_total,
                    created_at: inv.created_at,
                    credit_applied: inv.credit_applied,
                    extra_discount: inv.extra_discount,
                    discount_reason: inv.discount_reason,
                    paid_amount: inv.paid_amount,
                    payment_status: inv.payment_status,
                    order_id: inv.order_id
                });
            }
        });

        const ledgerArray = Object.values(userMap).filter((u: any) => u.total_invoices > 0);
        ledgerArray.sort((a: any, b: any) => {
            const dateA: any = a.invoices.length > 0 ? new Date(a.invoices[0].created_at) : new Date(0);
            const dateB: any = b.invoices.length > 0 ? new Date(b.invoices[0].created_at) : new Date(0);
            return dateB - dateA;
        });

        return c.json(ledgerArray);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

// GET /api/ledger/invoice/:order_id
router.get('/invoice/:order_id', async (c) => {
    try {
        const orderId = c.req.param('order_id');
        const orderQuery = getQueryId(orderId, 'sql_order_id');
        
        const order: any = await Models.Order.findOne(orderQuery)
            .populate('distributor_id')
            .populate({
                path: 'items.variant_id',
                populate: { path: 'product_id', populate: { path: 'category_id' } }
            })
            .lean();

        if (!order) return c.json({ message: 'Order not found' }, 404);

        const invoice = await Models.Invoice.findOne({ order_id: order._id }).lean() as any;
        if (!invoice) return c.json({ message: 'Invoice not found' }, 404);

        const user = order.distributor_id || {};

        const formattedInvoice = {
            invoice_id: invoice.sql_invoice_id || invoice._id.toString(),
            invoice_number: invoice.invoice_number,
            subtotal: invoice.subtotal,
            cgst_amount: invoice.cgst_amount,
            sgst_amount: invoice.sgst_amount,
            grand_total: invoice.grand_total,
            created_at: invoice.created_at,
            credit_applied: invoice.credit_applied,
            extra_discount: invoice.extra_discount,
            discount_reason: invoice.discount_reason,
            paid_amount: invoice.paid_amount,
            payment_status: invoice.payment_status,
            order_id: order.sql_order_id || order._id.toString(),
            firm_name: user.firm_name,
            gst_number: user.gst_number,
            phone_number: user.phone_number,
            address: user.address,
            owner_name: user.owner_name
        };

        const formattedItems = order.items.filter((i: any) => i.executed_qty > 0).map((i: any) => {
            const variant = i.variant_id || {};
            const product = variant.product_id || {};
            const category = product.category_id || {};

            return {
                order_item_id: i.sql_order_item_id || i._id.toString(),
                variant_id: variant.sql_variant_id || variant._id.toString(),
                product_name: product.name,
                hsn_code: product.hsn_code,
                gst_percent: product.gst_percent,
                uom: variant.uom,
                category_name: category.name,
                pack_size: variant.pack_size,
                pieces_per_box: variant.pieces_per_box,
                executed_qty: i.executed_qty,
                price_at_order: i.unit_price,
                item_total: i.executed_qty * i.unit_price
            };
        });

        return c.json({ invoice: formattedInvoice, items: formattedItems });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

// GET /api/ledger/invoice/:order_id/download
router.get('/invoice/:order_id/download', async (c) => {
    try {
        const orderId = c.req.param('order_id');
        const orderQuery = getQueryId(orderId, 'sql_order_id');
        
        const order: any = await Models.Order.findOne(orderQuery)
            .populate('distributor_id')
            .populate({
                path: 'items.variant_id',
                populate: { path: 'product_id', populate: { path: 'category_id' } }
            });

        if (!order) return c.json({ message: 'Order not found' }, 404);

        const invoice = await Models.Invoice.findOne({ order_id: order._id }) as any;
        if (!invoice) return c.json({ message: 'Invoice not found' }, 404);

        const user = order.distributor_id || {};
        const settings = await Models.CompanySettings.findOne() || {};

        const invoiceData = {
            invoice: {
                invoice_id: invoice.sql_invoice_id || invoice._id.toString(),
                invoice_number: invoice.invoice_number,
                subtotal: invoice.subtotal,
                cgst_amount: invoice.cgst_amount,
                sgst_amount: invoice.sgst_amount,
                grand_total: invoice.grand_total,
                created_at: invoice.created_at,
                pdf_url: invoice.pdf_url,
                extra_discount: invoice.extra_discount,
                order_id: order.sql_order_id || order._id.toString(),
                firm_name: user.firm_name,
                gst_number: user.gst_number,
                phone_number: user.phone_number,
                address: user.address,
                owner_name: user.owner_name
            },
            items: order.items.filter((i: any) => i.executed_qty > 0).map((i: any) => {
                const variant = i.variant_id || {};
                const product = variant.product_id || {};
                const category = product.category_id || {};
                return {
                    product_name: product.name,
                    hsn_code: product.hsn_code,
                    gst_percent: product.gst_percent,
                    uom: variant.uom,
                    category_name: category.name,
                    pack_size: variant.pack_size,
                    executed_qty: i.executed_qty,
                    price_at_order: i.unit_price,
                    item_total: i.executed_qty * i.unit_price
                };
            })
        };
        const pdfUrl = await generateInvoicePdf(invoiceData, settings, c.env.MY_BUCKET as any);
        
        invoice.pdf_url = pdfUrl;
        await invoice.save();

        const file = await c.env.MY_BUCKET.get(pdfUrl);
        if (!file) {
            return c.json({ message: 'File not found on server' }, 404);
        }

        c.header('Content-Type', 'application/pdf');
        c.header('Content-Disposition', `attachment; filename="Invoice_${invoice.invoice_number}.pdf"`);
        return c.body(file.body);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to generate PDF' }, 500);
    }
});

router.post('/payment/record', async (c) => {
    try {
        const { invoice_id, amount, payment_mode, reference_no, payment_date } = await c.req.json();
        
        const invQuery = getQueryId(invoice_id, 'sql_invoice_id');
        const invoice = await Models.Invoice.findOne(invQuery) as any;
        if (!invoice) throw new Error('Invoice not found');

        const order = await Models.Order.findById(invoice.order_id);
        if (!order) throw new Error('Order not found');

        const newPaidAmount = (invoice.paid_amount || 0) + Number(amount);
        let newStatus = 'PARTIAL';
        if (newPaidAmount >= invoice.grand_total - 0.01) {
            newStatus = 'PAID';
        }

        await Models.Payment.create({
            invoice_id: invoice._id,
            distributor_id: order.distributor_id,
            amount: Number(amount),
            payment_mode,
            reference_no,
            payment_date: payment_date ? new Date(payment_date) : new Date()
        });

        invoice.paid_amount = newPaidAmount;
        invoice.payment_status = newStatus;
        await invoice.save();

        return c.json({ message: 'Payment recorded successfully' });
    } catch (err: any) {
        console.error(err);
        return c.json({ message: err.message || 'Server Error' }, 500);
    }
});

router.post('/payment/record-bulk', async (c) => {
    try {
        const { distributor_id, amount, payment_mode, reference_no, payment_date } = await c.req.json();
        const effectiveDate = payment_date ? new Date(payment_date) : new Date();

        let remainingAmount = Number(amount);
        if (remainingAmount <= 0) throw new Error('Invalid amount');

        const distQuery = getQueryId(distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(distQuery) as any;
        if (!user) throw new Error('User not found');

        const orders = await Models.Order.find({ distributor_id: user._id }).lean();
        const orderIds = orders.map((o: any) => o._id);

        const unpaidInvoices = await Models.Invoice.find({ 
            order_id: { $in: orderIds },
            payment_status: { $ne: 'PAID' }
        }).sort({ created_at: 1 });

        for (let inv of unpaidInvoices as any[]) {
            if (remainingAmount <= 0) break;

            const pendingOnInvoice = Number(inv.grand_total) - Number(inv.paid_amount || 0);
            if (pendingOnInvoice <= 0.01) continue;

            const amountToApply = Math.min(remainingAmount, pendingOnInvoice);
            remainingAmount -= amountToApply;

            const newPaidAmount = Number(inv.paid_amount || 0) + amountToApply;
            let newStatus = 'PARTIAL';
            if (newPaidAmount >= Number(inv.grand_total) - 0.01) {
                newStatus = 'PAID';
            }

            await Models.Payment.create({
                invoice_id: inv._id,
                distributor_id: user._id,
                amount: amountToApply,
                payment_mode,
                reference_no,
                payment_date: effectiveDate
            });

            inv.paid_amount = newPaidAmount;
            inv.payment_status = newStatus;
            await inv.save();
        }

        if (remainingAmount > 0) {
            user.wallet_balance = (user.wallet_balance || 0) + remainingAmount;
            await user.save();
        }

        return c.json({ message: 'Bulk payment processed successfully', remaining_unapplied: remainingAmount });

    } catch (err: any) {
        console.error(err);
        return c.json({ message: err.message || 'Failed to process bulk payment' }, 500);
    }
});

router.get('/payment/invoice/:invoice_id', async (c) => {
    try {
        const invQuery = getQueryId(c.req.param('invoice_id'), 'sql_invoice_id');
        const invoice = await Models.Invoice.findOne(invQuery);
        if (!invoice) return c.json({ message: 'Invoice not found' }, 404);

        const payments = await Models.Payment.find({ invoice_id: invoice._id }).sort({ payment_date: -1 });
        return c.json(payments);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/payment/distributor/:distributor_id', async (c) => {
    try {
        const distQuery = getQueryId(c.req.param('distributor_id'), 'sql_user_id');
        const user = await Models.User.findOne(distQuery);
        if (!user) return c.json({ message: 'User not found' }, 404);

        const orders = await Models.Order.find({ distributor_id: user._id }).lean();
        const orderIds = orders.map((o: any) => o._id);

        const invoices = await Models.Invoice.find({ order_id: { $in: orderIds } }).lean();
        
        let total_billed = 0;
        let total_paid = 0;
        const unpaid_invoices: any[] = [];

        invoices.forEach((inv: any) => {
            total_billed += inv.grand_total;
            total_paid += (inv.paid_amount || 0);

            if (inv.payment_status !== 'PAID' && (inv.grand_total - (inv.paid_amount || 0)) > 0.01) {
                const order = orders.find((o: any) => o._id.toString() === inv.order_id.toString());
                unpaid_invoices.push({
                    invoice_id: inv.sql_invoice_id || inv._id.toString(),
                    invoice_number: inv.invoice_number,
                    grand_total: inv.grand_total,
                    paid_amount: inv.paid_amount,
                    created_at: inv.created_at,
                    order_id: order?.sql_order_id || inv.order_id.toString()
                });
            }
        });

        unpaid_invoices.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const payments = await Models.Payment.find({ distributor_id: user._id })
            .populate('invoice_id')
            .sort({ payment_date: -1 })
            .limit(50)
            .lean();

        const recent_payments = payments.map((p: any) => ({
            ...p,
            invoice_number: p.invoice_id?.invoice_number || 'N/A'
        }));

        return c.json({
            summary: { total_billed, total_paid },
            unpaid_invoices,
            recent_payments
        });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.delete('/invoice/:invoice_number', async (c) => {
    try {
        const invoice_number = c.req.param('invoice_number');
        const invoice = await Models.Invoice.findOne({ invoice_number });

        if (invoice) {
            await Models.Payment.deleteMany({ invoice_id: invoice._id });
            await Models.Invoice.findByIdAndDelete(invoice._id);
        }

        return c.json({ message: 'Invoice deleted successfully' });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to delete invoice' }, 500);
    }
});

router.post('/credit-note', async (c) => {
    try {
        const { distributor_id, invoice_id, items, is_paid_out, payment_mode, is_direct_amount, direct_amount, reason } = await c.req.json();
        
        const distQuery = getQueryId(distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(distQuery) as any;
        if (!user) throw new Error('User not found');

        let totalCreditAmount = 0;
        let finalItems: any[] = [];

        if (is_direct_amount) {
            totalCreditAmount = Number(direct_amount) || 0;
            finalItems = [];
        } else {
            for (const item of items) {
                const variantQuery = getQueryId(item.variant_id, 'sql_variant_id');
                const variant = await Models.Variant.findOne(variantQuery);
                
                const itemTotal = Number(item.quantity) * Number(item.price_at_order);
                totalCreditAmount += itemTotal;
                
                finalItems.push({
                    variant_id: variant ? variant._id : null,
                    quantity: Number(item.quantity),
                    pieces_qty: Number(item.pieces_qty) || 0,
                    reason: item.reason,
                    price_at_order: Number(item.price_at_order),
                    item_total: itemTotal
                });
            }
        }

        const count = await Models.CreditNote.countDocuments();
        const cnNumber = `CN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

        let invoiceDocId = null;
        if (invoice_id) {
            const invQuery = getQueryId(invoice_id, 'sql_invoice_id');
            const invoice = await Models.Invoice.findOne(invQuery);
            if (invoice) invoiceDocId = invoice._id;
        }

        const cn = await Models.CreditNote.create({
            distributor_id: user._id,
            invoice_id: invoiceDocId,
            cn_number: cnNumber,
            total_amount: totalCreditAmount,
            reason: reason || (is_direct_amount ? 'Direct Credit' : 'Item Return'),
            payment_mode: is_paid_out ? payment_mode : null,
            is_paid_out,
            applied_details: is_paid_out ? 'Refunded directly' : 'Added to wallet',
            items: finalItems
        });

        if (!is_paid_out) {
            user.wallet_balance = (user.wallet_balance || 0) + totalCreditAmount;
            await user.save();
        }

        return c.json({ message: 'Credit Note issued successfully', cn_id: cn._id.toString() });
    } catch (err: any) {
        console.error(err);
        return c.json({ message: err.message || 'Failed to issue credit note' }, 500);
    }
});

router.get('/credit-note/distributor/:distributor_id', async (c) => {
    try {
        const distQuery = getQueryId(c.req.param('distributor_id'), 'sql_user_id');
        const user = await Models.User.findOne(distQuery);
        if (!user) return c.json({ message: 'User not found' }, 404);

        const notes = await Models.CreditNote.find({ distributor_id: user._id })
            .populate('invoice_id')
            .populate('items.variant_id')
            .sort({ created_at: -1 })
            .lean();

        const formatted = notes.map((n: any) => ({
            cn_id: n.sql_credit_note_id || n._id.toString(),
            cn_number: n.cn_number,
            total_amount: n.total_amount,
            is_paid_out: n.is_paid_out,
            reason: n.reason,
            created_at: n.created_at,
            invoice_number: n.invoice_id?.invoice_number || 'N/A',
            pdf_url: n.pdf_url
        }));

        return c.json(formatted);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/credit-note/:cn_id/download', async (c) => {
    try {
        const cnQuery = getQueryId(c.req.param('cn_id'), 'sql_credit_note_id');
        const cn = await Models.CreditNote.findOne(cnQuery)
            .populate('distributor_id')
            .populate({
                path: 'items.variant_id',
                populate: { path: 'product_id' }
            }) as any;

        if (!cn) return c.json({ message: 'Credit Note not found' }, 404);
        
        const user = cn.distributor_id || {};
        const settings = await Models.CompanySettings.findOne() || {};

        const cnData = {
            credit_note: {
                credit_note_id: cn.sql_credit_note_id || cn._id.toString(),
                credit_note_number: cn.cn_number,
                total_amount: cn.total_amount,
                reason: cn.reason,
                created_at: cn.created_at,
                is_paid_out: cn.is_paid_out
            },
            items: cn.items.map((i: any) => {
                const variant = i.variant_id || {};
                const product = variant.product_id || {};
                return {
                    product_name: product.name || 'Unknown',
                    pack_size: variant.pack_size || '-',
                    reason: i.reason,
                    quantity: i.quantity,
                    price_at_order: i.price_at_order,
                    item_total: i.item_total
                };
            })
        };

        const pdfUrl = await generateCreditNotePdf(cnData, user, settings, c.env.MY_BUCKET as any);
        
        cn.pdf_url = pdfUrl;
        await cn.save();

        const file = await c.env.MY_BUCKET.get(pdfUrl);
        if (!file) {
            return c.json({ message: 'File not found on server' }, 404);
        }

        c.header('Content-Type', 'application/pdf');
        c.header('Content-Disposition', `attachment; filename="CN_${cn.cn_number}.pdf"`);
        return c.body(file.body);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to generate CN PDF' }, 500);
    }
});

// GET /api/ledger/credit-note-stats
router.get('/credit-note-stats', async (c) => {
    try {
        const notes = await Models.CreditNote.find().lean();
        const reasonCount: Record<string, number> = {};
        notes.forEach((cn: any) => {
            (cn.items || []).forEach((item: any) => {
                if (item.reason) {
                    reasonCount[item.reason] = (reasonCount[item.reason] || 0) + 1;
                }
            });
        });

        let topReason = 'N/A';
        let maxCount = 0;
        for (const [reason, count] of Object.entries(reasonCount)) {
            if ((count as number) > maxCount) {
                maxCount = count as number;
                topReason = reason;
            }
        }

        return c.json({ topReason });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error fetching credit note stats' }, 500);
    }
});

export default router;

