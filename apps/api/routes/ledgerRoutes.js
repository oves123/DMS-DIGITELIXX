const express = require('express');
const router = express.Router();
const { getInvoices, getInvoiceDetail, recordPayment, recordBulkPayment, getInvoicePayments, getDistributorLedger, downloadInvoicePdf, deleteInvoice, downloadDistributorLedger, issueCreditNote, getCreditNotes, getAllCreditNotes, downloadCreditNote, getCreditNoteItems, getCreditNoteStats } = require('../mongoControllers/ledgerController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', protect, getInvoices);
router.get('/invoice/:order_id', protect, getInvoiceDetail);
router.get('/invoice/:order_id/download', protect, downloadInvoicePdf);
router.delete('/invoice/:invoice_number', protect, adminOnly, deleteInvoice);

router.post('/payment/record', protect, adminOnly, recordPayment);
router.post('/payment/record-bulk', protect, adminOnly, recordBulkPayment);
router.get('/payment/invoice/:invoice_id', protect, getInvoicePayments);
router.get('/payment/distributor/:distributor_id', protect, getDistributorLedger);
router.get('/payment/distributor/:distributor_id/download', protect, downloadDistributorLedger);
router.post('/credit-note', protect, adminOnly, issueCreditNote);
router.get('/credit-note', protect, adminOnly, getAllCreditNotes);
router.get('/credit-note/distributor/:distributor_id', protect, getCreditNotes);
router.get('/credit-note-stats', protect, adminOnly, getCreditNoteStats);
router.get('/credit-note/:credit_note_id/download', protect, downloadCreditNote);
router.get('/credit-note/:credit_note_id/items', protect, adminOnly, getCreditNoteItems);

module.exports = router;
