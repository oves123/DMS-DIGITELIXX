const mongoose = require('mongoose');
const Models = require('../mongoModels/index');
const { generateInvoicePdf, generateLedgerPdf, generateCreditNotePdf } = require('../services/pdfService');
const path = require('path');
const fs = require('fs');

function getQueryId(id, sqlField) {
    return isNaN(id) ? { _id: id } : { [sqlField]: id };
}

// GET /api/ledger
exports.getInvoices = async (req, res) => {
    try {
        const users = await Models.User.find({ role: { $in: ['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'] } }).lean();
        const userIds = users.map(u => u._id);
        
        const orders = await Models.Order.find({ distributor_id: { $in: userIds } }).lean();
        const orderIds = orders.map(o => o._id);
        
        const invoices = await Models.Invoice.find({ order_id: { $in: orderIds } }).sort({ created_at: -1 }).lean();
        
        const userMap = {};
        users.forEach(u => {
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

        const orderToUser = {};
        orders.forEach(o => {
            orderToUser[o._id.toString()] = o.distributor_id.toString();
        });

        invoices.forEach(inv => {
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

        const ledgerArray = Object.values(userMap).filter(u => u.total_invoices > 0);
        ledgerArray.sort((a, b) => {
            const dateA = a.invoices.length > 0 ? new Date(a.invoices[0].created_at) : new Date(0);
            const dateB = b.invoices.length > 0 ? new Date(b.invoices[0].created_at) : new Date(0);
            return dateB - dateA;
        });

        res.json(ledgerArray);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// GET /api/ledger/invoice/:order_id
exports.getInvoiceDetail = async (req, res) => {
    try {
        const orderId = req.params.order_id;
        const orderQuery = getQueryId(orderId, 'sql_order_id');
        
        const order = await Models.Order.findOne(orderQuery)
            .populate('distributor_id')
            .populate({
                path: 'items.variant_id',
                populate: { path: 'product_id', populate: { path: 'category_id' } }
            })
            .lean();

        if (!order) return res.status(404).json({ message: 'Order not found' });

        const invoice = await Models.Invoice.findOne({ order_id: order._id }).lean();
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

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

        const formattedItems = order.items.filter(i => i.executed_qty > 0).map(i => {
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

        res.json({ invoice: formattedInvoice, items: formattedItems });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// GET /api/ledger/invoice/:order_id/download
exports.downloadInvoicePdf = async (req, res) => {
    try {
        const orderId = req.params.order_id;
        const orderQuery = getQueryId(orderId, 'sql_order_id');
        
        const order = await Models.Order.findOne(orderQuery)
            .populate('distributor_id')
            .populate({
                path: 'items.variant_id',
                populate: { path: 'product_id', populate: { path: 'category_id' } }
            });

        if (!order) return res.status(404).json({ message: 'Order not found' });

        const invoice = await Models.Invoice.findOne({ order_id: order._id });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

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
            items: order.items.filter(i => i.executed_qty > 0).map(i => {
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

        const pdfUrl = await generateInvoicePdf(invoiceData, settings);
        
        invoice.pdf_url = pdfUrl;
        await invoice.save();

        const pdfPath = path.join(__dirname, '../', pdfUrl);
        if (fs.existsSync(pdfPath)) {
            res.download(pdfPath, `Invoice_${invoice.invoice_number}.pdf`);
        } else {
            res.status(404).json({ message: 'File not found on server' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to generate PDF' });
    }
};

// POST /api/ledger/payment/record
exports.recordPayment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { invoice_id, amount, payment_mode, reference_no, payment_date, adminId } = req.body;
        
        const invQuery = getQueryId(invoice_id, 'sql_invoice_id');
        const invoice = await Models.Invoice.findOne(invQuery).session(session);
        if (!invoice) throw new Error('Invoice not found');

        const order = await Models.Order.findById(invoice.order_id).session(session);
        if (!order) throw new Error('Order not found');

        const newPaidAmount = (invoice.paid_amount || 0) + Number(amount);
        let newStatus = 'PARTIAL';
        if (newPaidAmount >= invoice.grand_total - 0.01) {
            newStatus = 'PAID';
        }

        await Models.Payment.create([{
            invoice_id: invoice._id,
            distributor_id: order.distributor_id,
            amount: Number(amount),
            payment_mode,
            reference_no,
            payment_date: payment_date ? new Date(payment_date) : new Date()
        }], { session });

        invoice.paid_amount = newPaidAmount;
        invoice.payment_status = newStatus;
        await invoice.save({ session });

        await session.commitTransaction();
        res.json({ message: 'Payment recorded successfully' });
    } catch (err) {
        console.error(err);
        await session.abortTransaction();
        res.status(500).json({ message: err.message || 'Server Error' });
    } finally {
        session.endSession();
    }
};

// POST /api/ledger/payment/record-bulk
exports.recordBulkPayment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { distributor_id, amount, payment_mode, reference_no, payment_date } = req.body;
        const effectiveDate = payment_date ? new Date(payment_date) : new Date();

        let remainingAmount = Number(amount);
        if (remainingAmount <= 0) throw new Error('Invalid amount');

        const distQuery = getQueryId(distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(distQuery).session(session);
        if (!user) throw new Error('User not found');

        // Fetch unpaid invoices for this distributor
        const orders = await Models.Order.find({ distributor_id: user._id }).session(session).lean();
        const orderIds = orders.map(o => o._id);

        const unpaidInvoices = await Models.Invoice.find({ 
            order_id: { $in: orderIds },
            payment_status: { $ne: 'PAID' }
        }).sort({ created_at: 1 }).session(session);

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

            await Models.Payment.create([{
                invoice_id: inv._id,
                distributor_id: user._id,
                amount: amountToApply,
                payment_mode,
                reference_no,
                payment_date: effectiveDate
            }], { session });

            inv.paid_amount = newPaidAmount;
            inv.payment_status = newStatus;
            await inv.save({ session });
        }

        if (remainingAmount > 0) {
            user.wallet_balance = (user.wallet_balance || 0) + remainingAmount;
            await user.save({ session });
        }

        await session.commitTransaction();
        res.json({ message: 'Bulk payment processed successfully', remaining_unapplied: remainingAmount });

    } catch (err) {
        console.error(err);
        await session.abortTransaction();
        res.status(500).json({ message: err.message || 'Failed to process bulk payment' });
    } finally {
        session.endSession();
    }
};

// GET /api/ledger/payment/invoice/:invoice_id
exports.getInvoicePayments = async (req, res) => {
    try {
        const invQuery = getQueryId(req.params.invoice_id, 'sql_invoice_id');
        const invoice = await Models.Invoice.findOne(invQuery);
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        const payments = await Models.Payment.find({ invoice_id: invoice._id }).sort({ payment_date: -1 });
        res.json(payments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// GET /api/ledger/payment/distributor/:distributor_id
exports.getDistributorLedger = async (req, res) => {
    try {
        const distQuery = getQueryId(req.params.distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(distQuery);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const orders = await Models.Order.find({ distributor_id: user._id }).lean();
        const orderIds = orders.map(o => o._id);

        const invoices = await Models.Invoice.find({ order_id: { $in: orderIds } }).lean();
        
        let total_billed = 0;
        let total_paid = 0;
        const unpaid_invoices = [];

        invoices.forEach(inv => {
            total_billed += inv.grand_total;
            total_paid += (inv.paid_amount || 0);

            if (inv.payment_status !== 'PAID' && (inv.grand_total - (inv.paid_amount || 0)) > 0.01) {
                const order = orders.find(o => o._id.toString() === inv.order_id.toString());
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

        unpaid_invoices.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const payments = await Models.Payment.find({ distributor_id: user._id })
            .populate('invoice_id')
            .sort({ payment_date: -1 })
            .limit(50)
            .lean();

        const recent_payments = payments.map(p => ({
            ...p,
            invoice_number: p.invoice_id?.invoice_number || 'N/A'
        }));

        res.json({
            summary: { total_billed, total_paid },
            unpaid_invoices,
            recent_payments
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// DELETE /api/ledger/invoice/:invoice_number
exports.deleteInvoice = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { invoice_number } = req.params;
        const invoice = await Models.Invoice.findOne({ invoice_number }).session(session);

        if (invoice) {
            await Models.Payment.deleteMany({ invoice_id: invoice._id }).session(session);
            await Models.Invoice.findByIdAndDelete(invoice._id).session(session);
        }

        await session.commitTransaction();
        res.json({ message: 'Invoice deleted successfully' });
    } catch (err) {
        console.error(err);
        await session.abortTransaction();
        res.status(500).json({ message: 'Failed to delete invoice' });
    } finally {
        session.endSession();
    }
};

// POST /api/ledger/credit-note
exports.issueCreditNote = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { distributor_id, invoice_id, items, is_paid_out, payment_mode, adminId, is_direct_amount, direct_amount, reason } = req.body;
        
        const distQuery = getQueryId(distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(distQuery).session(session);
        if (!user) throw new Error('User not found');

        let totalCreditAmount = 0;
        let finalItems = [];

        if (is_direct_amount) {
            totalCreditAmount = parseFloat(direct_amount);
            finalItems = [{
                variant_id: null,
                quantity: 1,
                pieces_qty: 0,
                reason: reason || 'Direct Amount / Subsidy',
                price_at_order: totalCreditAmount,
                item_total: totalCreditAmount
            }];
        } else {
            for (let item of items) {
                const gstPct = parseFloat(item.gst_percent) || 0;
                const itemCGST = item.item_total * ((gstPct / 2) / 100);
                const itemSGST = item.item_total * ((gstPct / 2) / 100);
                totalCreditAmount += (item.item_total + itemCGST + itemSGST);
                
                const varQuery = getQueryId(item.variant_id, 'sql_variant_id');
                const variant = await Models.Variant.findOne(varQuery).session(session);
                
                finalItems.push({
                    variant_id: variant?._id,
                    quantity: item.quantity,
                    pieces_qty: item.pieces_qty,
                    reason: item.reason,
                    price_at_order: item.price_at_order,
                    item_total: item.item_total
                });
            }
        }

        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        let startYear = (currentMonth >= 3) ? currentYear : currentYear - 1;
        let endYear = startYear + 1;
        const finYearString = `${startYear}-${endYear}`;

        const lastCN = await Models.CreditNote.findOne({ cn_number: new RegExp(`/${finYearString}$`) })
            .sort({ created_at: -1 })
            .session(session);

        let nextSeq = 1;
        if (lastCN && lastCN.cn_number) {
            const parts = lastCN.cn_number.split('/');
            nextSeq = parseInt(parts[0], 10) + 1;
        }

        if (finYearString === '2026-2027' && nextSeq === 1) nextSeq = 32;

        const creditNoteNumber = `${nextSeq}/${finYearString}`;
        
        let invObjId = null;
        if (!is_direct_amount && invoice_id) {
            const invQ = getQueryId(invoice_id, 'sql_invoice_id');
            const invMatch = await Models.Invoice.findOne(invQ).session(session);
            if (invMatch) invObjId = invMatch._id;
        }

        const cn = await Models.CreditNote.create([{
            distributor_id: user._id,
            cn_number: creditNoteNumber,
            total_amount: totalCreditAmount,
            reason: is_direct_amount ? reason : 'Defective Return',
            items: finalItems
        }], { session });
        
        const creditNote = cn[0];
        
        // Auto-Reconciliation logic can be added here, currently just putting it into wallet for simplicity
        if (!is_paid_out) {
            user.wallet_balance = (user.wallet_balance || 0) + totalCreditAmount;
            await user.save({ session });
        } else {
             await Models.Payment.create([{
                invoice_id: invObjId,
                distributor_id: user._id,
                amount: totalCreditAmount,
                payment_mode: `Refund: ${payment_mode}`,
                reference_no: `CN: ${creditNoteNumber}`,
                payment_date: new Date()
            }], { session });
        }

        await session.commitTransaction();
        res.json({ message: 'Credit Note issued successfully.' });
    } catch (err) {
        console.error(err);
        await session.abortTransaction();
        res.status(500).json({ message: 'Failed to issue credit note' });
    } finally {
        session.endSession();
    }
};

// GET /api/ledger/credit-note
exports.getAllCreditNotes = async (req, res) => {
    try {
        const notes = await Models.CreditNote.find().populate('distributor_id').sort({ created_at: -1 });
        res.json(notes.map(cn => ({
            credit_note_id: cn.sql_credit_note_id || cn._id.toString(),
            credit_note_number: cn.cn_number,
            amount: cn.total_amount,
            created_at: cn.created_at,
            distributor_name: cn.distributor_id?.firm_name,
            distributor_id: cn.distributor_id?.sql_user_id || cn.distributor_id?._id.toString()
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// GET /api/ledger/payment/distributor/:distributor_id/download
exports.downloadDistributorLedger = async (req, res) => {
    try {
        const distQuery = getQueryId(req.params.distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(distQuery);
        if (!user) return res.status(404).json({ message: 'Distributor not found' });

        const settings = await Models.CompanySettings.findOne() || {};

        const orders = await Models.Order.find({ distributor_id: user._id }).lean();
        const orderIds = orders.map(o => o._id);

        const invoices = await Models.Invoice.find({ order_id: { $in: orderIds } }).lean();
        const payments = await Models.Payment.find({ distributor_id: user._id }).lean();

        let total_billed = 0;
        let total_paid = 0;

        let history = [];
        invoices.forEach(inv => {
            total_billed += inv.grand_total;
            total_paid += (inv.paid_amount || 0);

            history.push({
                date: inv.created_at,
                type: 'INVOICE',
                ref: inv.invoice_number,
                debit: inv.grand_total,
                credit: null
            });
        });

        payments.forEach(pay => {
            history.push({
                date: pay.payment_date,
                type: 'PAYMENT',
                ref: pay.payment_mode || 'Payment',
                debit: null,
                credit: pay.amount
            });
        });

        history.sort((a, b) => new Date(a.date) - new Date(b.date));

        let runningBalance = 0;
        history = history.map(item => {
            if (item.type === 'INVOICE') {
                runningBalance += item.debit;
            } else {
                runningBalance -= item.credit;
            }
            return { ...item, balance: runningBalance };
        });

        const summary = {
            total_billed,
            total_paid,
            total_pending: total_billed - total_paid
        };

        const ledgerData = { summary, history };

        const pdfPath = await generateLedgerPdf(ledgerData, user, settings);

        res.download(pdfPath, `Ledger_${user.firm_name.replace(/[^a-z0-9]/gi, '_')}.pdf`, (err) => {
            if (err) console.error("Error sending PDF:", err);
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error generating ledger PDF' });
    }
};

// GET /api/ledger/credit-note/distributor/:distributor_id
exports.getCreditNotes = async (req, res) => {
    try {
        const distQuery = getQueryId(req.params.distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(distQuery);
        if (!user) return res.status(404).json({ message: 'Distributor not found' });

        const notes = await Models.CreditNote.find({ distributor_id: user._id }).sort({ created_at: -1 });
        res.json(notes.map(cn => ({
            credit_note_id: cn.sql_credit_note_id || cn._id.toString(),
            credit_note_number: cn.cn_number,
            amount: cn.total_amount,
            created_at: cn.created_at
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error fetching credit notes' });
    }
};

// GET /api/ledger/credit-note/:credit_note_id/download
exports.downloadCreditNote = async (req, res) => {
    // Requires pdfUrl in schema which isn't added yet, returning 404
    return res.status(404).json({ message: 'Credit Note PDF not found' });
};

// GET /api/ledger/credit-note/:credit_note_id/items
exports.getCreditNoteItems = async (req, res) => {
    try {
        const cnQuery = getQueryId(req.params.credit_note_id, 'sql_credit_note_id');
        const cn = await Models.CreditNote.findOne(cnQuery).populate({
            path: 'items.variant_id',
            populate: { path: 'product_id' }
        });

        if (!cn) return res.status(404).json({ message: 'Credit note not found' });

        res.json(cn.items.map(item => ({
            quantity: item.quantity,
            pieces_qty: item.pieces_qty,
            reason: item.reason,
            price_at_order: item.price_at_order,
            item_total: item.item_total,
            product_name: item.variant_id?.product_id?.name || 'Direct Amount',
            pack_size: item.variant_id?.pack_size || '-'
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error fetching credit note items' });
    }
};

// GET /api/ledger/credit-note-stats
exports.getCreditNoteStats = async (req, res) => {
    try {
        const notes = await Models.CreditNote.find().lean();
        const reasonCount = {};
        notes.forEach(cn => {
            (cn.items || []).forEach(item => {
                if (item.reason) {
                    reasonCount[item.reason] = (reasonCount[item.reason] || 0) + 1;
                }
            });
        });

        let topReason = 'N/A';
        let maxCount = 0;
        for (const [reason, count] of Object.entries(reasonCount)) {
            if (count > maxCount) {
                maxCount = count;
                topReason = reason;
            }
        }
        res.json({ topReason });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error fetching credit note stats' });
    }
};
