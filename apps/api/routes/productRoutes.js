const express = require('express');
const router = express.Router();
const { getCategories, addCategory, getProducts, addProduct, updateProductVariant, deleteProductVariant, bulkUploadProducts, addProductVariant } = require('../mongoControllers/productController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Optional: Add authMiddleware to these routes to ensure only Admin can modify products
router.get('/categories', protect, getCategories);
router.post('/categories', protect, adminOnly, addCategory);

router.get('/', protect, getProducts);
router.post('/', protect, adminOnly, addProduct);
router.post('/bulk', protect, adminOnly, bulkUploadProducts);
router.put('/:variant_id', protect, adminOnly, updateProductVariant);
router.delete('/:variant_id', protect, adminOnly, deleteProductVariant);
router.post('/:product_id/variants', protect, adminOnly, addProductVariant);

module.exports = router;
