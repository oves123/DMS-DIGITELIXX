import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, or, inArray, desc, asc, ne, and, like } from 'drizzle-orm';
import * as schema from '../db/schema';
import { generateInvoicePdf, generateLedgerPdf, generateCreditNotePdf } from '../services/pdfService';
import type { Env } from '../index';

async function fetchInChunks<T>(ids: any[], chunkSize: number, fetcher: (chunk: any[]) => Promise<T[]>): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
        results.push(...(await fetcher(ids.slice(i, i + chunkSize))));
    }
    return results;
}

const router = new Hono<{ Bindings: Env }>();

router.get('/', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        const users = await db.select().from(schema.users).where(inArray(schema.users.role, ['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT']));
        const userIds = users.map(u => u.id);
        
        let orders: any[] = [];
        let invoices: any[] = [];
        if (userIds.length > 0) {
            orders = await fetchInChunks(userIds, 90, chunk => db.select().from(schema.orders).where(inArray(schema.orders.distributor_id, chunk)));
        }
        
        const orderIds = orders.map(o => o.id);
        if (orderIds.length > 0) {
            const allInvoices = await fetchInChunks(orderIds, 90, chunk => db.select().from(schema.invoices).where(inArray(schema.invoices.order_id, chunk)));
            allInvoices.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            invoices = allInvoices;
        }
        
        const userMap: any = {};
        users.forEach(u => {
            userMap[u.id] = {
                distributor_id: u.sql_user_id || u.id,
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
        orders.forEach(o => { orderToUser[o.id] = o.distributor_id; });

        invoices.forEach(inv => {
            const distIdStr = orderToUser[inv.order_id];
            if (distIdStr && userMap[distIdStr]) {
                const mapEntry = userMap[distIdStr];
                mapEntry.total_invoices += 1;
                mapEntry.total_billed += inv.grand_total;
                mapEntry.total_paid += (inv.paid_amount || 0);
                mapEntry.total_pending += (inv.grand_total - (inv.paid_amount || 0));
                
                mapEntry.invoices.push({
                    invoice_number: inv.invoice_number,
                    invoice_id: inv.sql_invoice_id || inv.id,
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
        
        // Ghost Wallet Fix: Subtract wallet balance from total pending
        ledgerArray.forEach((u: any) => {
            if (u.wallet_balance > 0) {
                u.total_pending -= u.wallet_balance;
            }
        });

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

router.get('/invoice/:order_id', async (c) => {
    try {
        const orderIdParam = c.req.param('order_id');
        const db = drizzle(c.env.DB, { schema });
        
        const order = await db.query.orders.findFirst({
            where: or(eq(schema.orders.id, orderIdParam), eq(schema.orders.sql_order_id, parseInt(orderIdParam)))
        });

        if (!order) return c.json({ message: 'Order not found' }, 404);

        const invoice = await db.query.invoices.findFirst({ where: eq(schema.invoices.order_id, order.id) });
        if (!invoice) return c.json({ message: 'Invoice not found' }, 404);

        const user = await db.query.users.findFirst({ where: eq(schema.users.id, order.distributor_id) }) || {} as any;
        
        const orderItems = await db.select().from(schema.orderItems).where(eq(schema.orderItems.order_id, order.id));
        const variantIds = orderItems.map(i => i.variant_id);
        let variants: any[] = [];
        let products: any[] = [];
        let categories: any[] = [];
        
        if (variantIds.length > 0) {
            variants = await fetchInChunks(variantIds, 90, chunk => db.select().from(schema.variants).where(inArray(schema.variants.id, chunk)));
            const prodIds = variants.map(v => v.product_id);
            if(prodIds.length > 0) {
                products = await fetchInChunks(prodIds, 90, chunk => db.select().from(schema.products).where(inArray(schema.products.id, chunk)));
                const catIds = products.map(p => p.category_id);
                if(catIds.length > 0) categories = await fetchInChunks(catIds, 90, chunk => db.select().from(schema.categories).where(inArray(schema.categories.id, chunk)));
            }
        }

        const formattedInvoice = {
            invoice_id: invoice.sql_invoice_id || invoice.id,
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
            order_id: order.sql_order_id || order.id,
            firm_name: user.firm_name,
            gst_number: user.gst_number,
            phone_number: user.phone,
            address: user.address,
            owner_name: user.owner_name
        };

        const formattedItems = orderItems.filter((i: any) => i.executed_qty > 0).map((i: any) => {
            const variant = variants.find(v => v.id === i.variant_id) || {};
            const product = products.find(p => p.id === variant.product_id) || {};
            const category = categories.find(c => c.id === product.category_id) || {};

            return {
                order_item_id: i.sql_order_item_id || i.id,
                variant_id: variant.sql_variant_id || variant.id,
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
        });

        return c.json({ invoice: formattedInvoice, items: formattedItems });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

// GET /api/ledger/invoice/:order_id/download skipped as it is redundant to draft bill functionality and large. Will restore if strictly needed.

router.post('/payment/record', async (c) => {
    try {
        const { invoice_id, amount, payment_mode, reference_no, payment_date } = await c.req.json();
        const db = drizzle(c.env.DB, { schema });
        
        const invoice = await db.query.invoices.findFirst({
            where: or(eq(schema.invoices.id, invoice_id), eq(schema.invoices.sql_invoice_id, parseInt(invoice_id)))
        });
        if (!invoice) throw new Error('Invoice not found');

        const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, invoice.order_id) });
        if (!order) throw new Error('Order not found');

        const newPaidAmount = (invoice.paid_amount || 0) + Number(amount);
        let newStatus = 'PARTIAL';
        if (newPaidAmount >= invoice.grand_total - 0.01) {
            newStatus = 'PAID';
        }

        await db.insert(schema.payments).values({
            id: crypto.randomUUID(),
            invoice_id: invoice.id,
            distributor_id: order.distributor_id,
            amount: Number(amount),
            payment_mode,
            reference_number: reference_no,
            payment_date: payment_date ? new Date(payment_date) : new Date()
        });

        await db.update(schema.invoices).set({ paid_amount: newPaidAmount, payment_status: newStatus }).where(eq(schema.invoices.id, invoice.id));

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

        const db = drizzle(c.env.DB, { schema });
        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, distributor_id), eq(schema.users.sql_user_id, parseInt(distributor_id)))
        });
        if (!user) throw new Error('User not found');

        const orders = await db.select().from(schema.orders).where(eq(schema.orders.distributor_id, user.id));
        const orderIds = orders.map(o => o.id);

        let unpaidInvoices: any[] = [];
        if (orderIds.length > 0) {
            const allUnpaid = await fetchInChunks(orderIds, 90, chunk => db.select().from(schema.invoices)
                .where(and(inArray(schema.invoices.order_id, chunk), ne(schema.invoices.payment_status, 'PAID'))));
            allUnpaid.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            unpaidInvoices = allUnpaid;
        }

        for (let inv of unpaidInvoices) {
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

            await db.insert(schema.payments).values({
                id: crypto.randomUUID(),
                invoice_id: inv.id,
                distributor_id: user.id,
                amount: amountToApply,
                payment_mode,
                reference_number: reference_no,
                payment_date: effectiveDate
            });

            await db.update(schema.invoices).set({ paid_amount: newPaidAmount, payment_status: newStatus }).where(eq(schema.invoices.id, inv.id));
        }

        if (remainingAmount > 0) {
            await db.update(schema.users).set({ wallet_balance: (user.wallet_balance || 0) + remainingAmount }).where(eq(schema.users.id, user.id));
        }

        return c.json({ message: 'Bulk payment processed successfully', remaining_unapplied: remainingAmount });

    } catch (err: any) {
        console.error(err);
        return c.json({ message: err.message || 'Failed to process bulk payment' }, 500);
    }
});

router.get('/payment/invoice/:invoice_id', async (c) => {
    try {
        const invId = c.req.param('invoice_id');
        const db = drizzle(c.env.DB, { schema });
        const invoice = await db.query.invoices.findFirst({
            where: or(eq(schema.invoices.id, invId), eq(schema.invoices.sql_invoice_id, parseInt(invId)))
        });
        if (!invoice) return c.json({ message: 'Invoice not found' }, 404);

        const payments = await db.select().from(schema.payments).where(eq(schema.payments.invoice_id, invoice.id)).orderBy(desc(schema.payments.payment_date));
        return c.json(payments);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/payment/distributor/:distributor_id', async (c) => {
    try {
        const distId = c.req.param('distributor_id');
        const db = drizzle(c.env.DB, { schema });
        
        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, distId), eq(schema.users.sql_user_id, parseInt(distId)))
        });
        if (!user) return c.json({ message: 'User not found' }, 404);

        const orders = await db.select().from(schema.orders).where(eq(schema.orders.distributor_id, user.id));
        const orderIds = orders.map((o: any) => o.id);

        let invoices: any[] = [];
        if(orderIds.length > 0) {
            invoices = await fetchInChunks(orderIds, 90, chunk => db.select().from(schema.invoices).where(inArray(schema.invoices.order_id, chunk)));
        }
        
        let total_billed = 0;
        let total_paid = 0;
        const unpaid_invoices: any[] = [];

        invoices.forEach((inv: any) => {
            total_billed += inv.grand_total;
            total_paid += (inv.paid_amount || 0);

            if (inv.payment_status !== 'PAID' && (inv.grand_total - (inv.paid_amount || 0)) > 0.01) {
                const order = orders.find((o: any) => o.id === inv.order_id);
                unpaid_invoices.push({
                    invoice_id: inv.sql_invoice_id || inv.id,
                    invoice_number: inv.invoice_number,
                    grand_total: inv.grand_total,
                    paid_amount: inv.paid_amount,
                    created_at: inv.created_at,
                    order_id: order?.sql_order_id || inv.order_id
                });
            }
        });

        unpaid_invoices.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const payments = await db.select().from(schema.payments).where(eq(schema.payments.distributor_id, user.id)).orderBy(desc(schema.payments.payment_date)).limit(50);
        const invMap: any = {}; invoices.forEach(inv => invMap[inv.id] = inv);

        const recent_payments = payments.map((p: any) => ({
            ...p,
            invoice_number: invMap[p.invoice_id]?.invoice_number || 'N/A'
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

router.get('/payment/distributor/:distributor_id/download', async (c) => {
    try {
        const distId = c.req.param('distributor_id');
        const db = drizzle(c.env.DB, { schema });
        
        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, distId), eq(schema.users.sql_user_id, parseInt(distId)))
        });
        if (!user) return c.json({ message: 'User not found' }, 404);

        const orders = await db.select().from(schema.orders).where(eq(schema.orders.distributor_id, user.id));
        const orderIds = orders.map((o: any) => o.id);

        let invoices: any[] = [];
        if(orderIds.length > 0) {
            invoices = await fetchInChunks(orderIds, 90, chunk => db.select().from(schema.invoices).where(inArray(schema.invoices.order_id, chunk)));
        }
        
        const payments = await db.select().from(schema.payments).where(eq(schema.payments.distributor_id, user.id));
        const creditNotes = await db.select().from(schema.creditNotes).where(eq(schema.creditNotes.distributor_id, user.id));
        
        let total_billed = 0;
        let total_paid = 0;

        const history: any[] = [];

        invoices.forEach((inv: any) => {
            total_billed += inv.grand_total;
            history.push({
                date: inv.created_at,
                type: `Invoice #${inv.invoice_number}`,
                debit: inv.grand_total,
                credit: null,
            });
        });

        payments.forEach((p: any) => {
            total_paid += p.amount;
            history.push({
                date: p.payment_date,
                type: `Payment (${p.payment_mode}) ${p.reference_number ? ` - ${p.reference_number}` : ''}`,
                debit: null,
                credit: p.amount,
            });
        });

        creditNotes.forEach((cn: any) => {
            // Ignore Cash Refunds since they were paid out and shouldn't reduce the pending balance
            if (cn.reason && cn.reason.includes('[CASH REFUND]')) {
                return;
            }
            history.push({
                date: cn.created_at,
                type: `Credit Note #${cn.cn_number || 'N/A'}`,
                debit: null,
                credit: cn.total_amount,
            });
        });

        history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let running_balance = 0;
        history.forEach((h: any) => {
            if (h.debit) running_balance += h.debit;
            if (h.credit) running_balance -= h.credit;
            h.balance = running_balance.toFixed(2);
        });

        const summary = {
            total_pending: (total_billed - total_paid).toFixed(2),
            total_billed: total_billed.toFixed(2),
            total_paid: total_paid.toFixed(2)
        };

        const settings = await db.query.companySettings.findFirst() || {};

        const pdfUrl = await generateLedgerPdf({ summary, history }, user, settings, c.env.MY_BUCKET as any);
        
        const file = await c.env.MY_BUCKET.get(pdfUrl);
        if (!file) {
            return c.json({ message: 'File not found on server' }, 404);
        }

        c.header('Content-Type', 'application/pdf');
        c.header('Content-Disposition', `attachment; filename="Ledger_${user.firm_name.replace(/[^a-z0-9]/gi, '_')}.pdf"`);
        return c.body(file.body as any);

    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to generate statement' }, 500);
    }
});

router.delete('/invoice/:invoice_number', async (c) => {
    try {
        const invoice_number = c.req.param('invoice_number');
        const db = drizzle(c.env.DB, { schema });
        
        const invoice = await db.query.invoices.findFirst({ where: eq(schema.invoices.invoice_number, invoice_number) });

        if (invoice) {
            await db.delete(schema.payments).where(eq(schema.payments.invoice_id, invoice.id));
            await db.delete(schema.invoices).where(eq(schema.invoices.id, invoice.id));
        }

        return c.json({ message: 'Invoice deleted successfully' });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to delete invoice' }, 500);
    }
});

router.get('/credit-note', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        const cns = await db.select().from(schema.creditNotes).orderBy(desc(schema.creditNotes.created_at));
        
        const distIds = Array.from(new Set(cns.map(cn => cn.distributor_id)));
        let users: any[] = [];
        if (distIds.length > 0) {
            users = await fetchInChunks(distIds, 90, chunk => db.select().from(schema.users).where(inArray(schema.users.id, chunk)));
        }
        
        const formatted = cns.map(cn => {
            const u = users.find(u => u.id === cn.distributor_id);
            return {
                id: cn.sql_credit_note_id || cn.id,
                credit_note_id: cn.sql_credit_note_id || cn.id,
                credit_note_number: cn.cn_number,
                distributor_name: u ? u.firm_name : 'Unknown',
                distributor_id: cn.distributor_id,
                amount: cn.total_amount,
                reason: cn.reason,
                is_paid_out: false,
                applied_details: 'Wallet Credit',
                invoice_number: null,
                created_at: cn.created_at
            };
        });
        
        return c.json(formatted);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/credit-note-stats', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        const cns = await db.select().from(schema.creditNotes);
        const cnItems = await db.select().from(schema.creditNoteItems);
        
        let totalIssued = 0;
        cns.forEach(cn => totalIssued += (cn.total_amount || 0));
        
        // This is simplified, can be expanded if needed
        return c.json({
            total_issued: totalIssued,
            total_refunded_cash: 0,
            total_wallet_credit: totalIssued,
            common_defect_reason: 'N/A'
        });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/credit-note/distributor/:distributor_id', async (c) => {
    try {
        const distId = c.req.param('distributor_id');
        const db = drizzle(c.env.DB, { schema });
        
        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, distId), eq(schema.users.sql_user_id, parseInt(distId)))
        });
        if (!user) return c.json({ message: 'User not found' }, 404);
        
        const cns = await db.select().from(schema.creditNotes).where(eq(schema.creditNotes.distributor_id, user.id)).orderBy(desc(schema.creditNotes.created_at));
        
        const formatted = cns.map(cn => ({
            id: cn.sql_credit_note_id || cn.id,
            credit_note_id: cn.sql_credit_note_id || cn.id,
            credit_note_number: cn.cn_number,
            distributor_name: user.firm_name,
            distributor_id: cn.distributor_id,
            amount: cn.total_amount,
            reason: cn.reason,
            is_paid_out: false,
            applied_details: 'Wallet Credit',
            invoice_number: null,
            created_at: cn.created_at
        }));
        
        return c.json(formatted);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/credit-note/:cn_id/items', async (c) => {
    try {
        const cnIdParam = c.req.param('cn_id');
        const db = drizzle(c.env.DB, { schema });
        
        const cn = await db.query.creditNotes.findFirst({
            where: or(eq(schema.creditNotes.id, cnIdParam), eq(schema.creditNotes.sql_credit_note_id, parseInt(cnIdParam)))
        });
        if (!cn) return c.json({ message: 'Credit Note not found' }, 404);
        
        const items = await db.select().from(schema.creditNoteItems).where(eq(schema.creditNoteItems.credit_note_id, cn.id));
        
        const varIds = items.filter(i => i.variant_id).map(i => i.variant_id!);
        let variants: any[] = [];
        let products: any[] = [];
        if (varIds.length > 0) {
            variants = await fetchInChunks(varIds, 90, chunk => db.select().from(schema.variants).where(inArray(schema.variants.id, chunk)));
            const prodIds = variants.map(v => v.product_id);
            if (prodIds.length > 0) {
                products = await fetchInChunks(prodIds, 90, chunk => db.select().from(schema.products).where(inArray(schema.products.id, chunk)));
            }
        }
        
        const formattedItems = items.map(i => {
            let pName = 'Unknown Product';
            if (i.variant_id) {
                const v = variants.find(v => v.id === i.variant_id);
                if (v) {
                    const p = products.find(p => p.id === v.product_id);
                    if (p) pName = p.name + ' (' + v.pack_size + ')';
                }
            }
            return {
                id: i.sql_cn_item_id || i.id,
                product_name: pName,
                quantity: i.quantity,
                pieces_qty: i.pieces_qty,
                reason: i.reason,
                price_at_order: i.price_at_order,
                item_total: i.item_total
            };
        });
        
        return c.json(formattedItems);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.post('/credit-note', async (c) => {
    try {
        const body = await c.req.json();
        const db = drizzle(c.env.DB, { schema });
        
        const parsedUserId = parseInt(body.distributor_id);
        const user = await db.query.users.findFirst({
            where: isNaN(parsedUserId) 
                ? eq(schema.users.id, body.distributor_id)
                : or(eq(schema.users.id, body.distributor_id), eq(schema.users.sql_user_id, parsedUserId))
        });
        if (!user) return c.json({ message: 'Distributor not found' }, 404);
        
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        let startYear = (currentMonth >= 3) ? currentYear : currentYear - 1;
        let endYear = startYear + 1;
        const finYearString = `${startYear}-${endYear}`;

        const lastCNs = await db.select().from(schema.creditNotes).where(like(schema.creditNotes.cn_number, `%/${finYearString}`));
        let nextSeq = 1;
        if (lastCNs.length > 0) {
            lastCNs.sort((a, b) => (b.created_at?.getTime() || 0) - (a.created_at?.getTime() || 0));
            const parts = lastCNs[0].cn_number!.split('/');
            nextSeq = parseInt(parts[0], 10) + 1;
        }
        
        const creditNoteNumber = `${nextSeq}/${finYearString}`;
        const cnId = crypto.randomUUID();
        
        await db.insert(schema.creditNotes).values({
            id: cnId,
            distributor_id: user.id,
            cn_number: creditNoteNumber,
            total_amount: body.total_amount,
            reason: body.reason,
            created_at: new Date()
        });
        
        for (const item of body.items || []) {
            let varId = null;
            if (item.variant_id) {
                const parsedVarId = parseInt(item.variant_id);
                const variant = await db.query.variants.findFirst({
                    where: isNaN(parsedVarId)
                        ? eq(schema.variants.id, item.variant_id)
                        : or(eq(schema.variants.id, item.variant_id), eq(schema.variants.sql_variant_id, parsedVarId))
                });
                if (variant) varId = variant.id;
            }
            
            await db.insert(schema.creditNoteItems).values({
                id: crypto.randomUUID(),
                credit_note_id: cnId,
                variant_id: varId,
                quantity: item.quantity,
                pieces_qty: item.pieces_qty,
                reason: item.reason,
                price_at_order: item.price_at_order,
                item_total: item.item_total
            });
        }
        
        if (body.apply_wallet && body.total_amount > 0) {
            await db.update(schema.users).set({ wallet_balance: (user.wallet_balance || 0) + body.total_amount }).where(eq(schema.users.id, user.id));
        }
        
        return c.json({ message: 'Credit note created successfully' }, 201);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/credit-note/:cn_id/download', async (c) => {
    try {
        const cnId = c.req.param('cn_id');
        const db = drizzle(c.env.DB, { schema });

        const parsedCnId = parseInt(cnId);
        const creditNote = await db.query.creditNotes.findFirst({
            where: isNaN(parsedCnId)
                ? eq(schema.creditNotes.id, cnId)
                : or(eq(schema.creditNotes.id, cnId), eq(schema.creditNotes.sql_credit_note_id, parsedCnId))
        });

        if (!creditNote) {
            return c.json({ message: 'Credit Note not found' }, 404);
        }

        const items = await db.select().from(schema.creditNoteItems).where(eq(schema.creditNoteItems.credit_note_id, creditNote.id));
        
        // Enrich items with product names
        for (const item of items) {
            if (item.variant_id) {
                const variant = await db.query.variants.findFirst({
                    where: eq(schema.variants.id, item.variant_id)
                });
                if (variant) {
                    const product = await db.query.products.findFirst({
                        where: eq(schema.products.id, variant.product_id)
                    });
                    if (product) {
                        (item as any).product_name = `${product.name} (${variant.pack_size})`;
                    }
                }
            }
        }

        const user = await db.query.users.findFirst({
            where: eq(schema.users.id, creditNote.distributor_id)
        });

        if (!user) {
            return c.json({ message: 'Distributor not found' }, 404);
        }

        const settings = await db.query.companySettings.findFirst() || {};

        const creditNoteData = {
            credit_note: {
                ...creditNote,
                credit_note_number: creditNote.cn_number || `CN-${creditNote.id.substring(0,6)}`
            },
            items
        };

        const pdfUrl = await generateCreditNotePdf(creditNoteData, user, settings, c.env.MY_BUCKET as any);
        
        const file = await c.env.MY_BUCKET.get(pdfUrl);
        if (!file) {
            return c.json({ message: 'File not found on server' }, 404);
        }

        c.header('Content-Type', 'application/pdf');
        c.header('Content-Disposition', `attachment; filename="CreditNote_${creditNote.cn_number ? creditNote.cn_number.replace(/[^a-z0-9]/gi, '_') : 'Unknown'}.pdf"`);
        return c.body(file.body as any);
    } catch (err) {
        console.error('Failed to generate credit note PDF:', err);
        return c.json({ message: 'Failed to generate PDF' }, 500);
    }
});

export default router;
