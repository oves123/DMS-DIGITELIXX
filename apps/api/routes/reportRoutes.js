const express = require('express');
const router = express.Router();
const { 
    getAdminSales, 
    getAdminTopProducts, 
    getAdminTopDistributors, 
    getAdminInventoryAlerts,
    getDistributorPurchases,
    getDistributorTopProducts,
    getDetailedTransactions
} = require('../mongoControllers/reportsController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Admin Reports
router.get('/admin/sales', protect, adminOnly, getAdminSales);
router.get('/admin/transactions', protect, adminOnly, getDetailedTransactions);
router.get('/admin/products', protect, adminOnly, getAdminTopProducts);
router.get('/admin/distributors', protect, adminOnly, getAdminTopDistributors);
router.get('/admin/inventory', protect, adminOnly, getAdminInventoryAlerts);

// Distributor Reports
router.get('/distributor/:id/purchases', protect, getDistributorPurchases);
router.get('/distributor/:id/products', protect, getDistributorTopProducts);

module.exports = router;
