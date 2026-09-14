const express = require('express');
const router = express.Router();
const { getInventory, updateStock, updateStockInline } = require('../mongoControllers/inventoryController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', protect, adminOnly, getInventory);
router.post('/update', protect, adminOnly, updateStock);
router.put('/inline/:variant_id', protect, adminOnly, updateStockInline);

module.exports = router;
