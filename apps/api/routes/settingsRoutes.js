const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getCompanySettings, updateCompanySettings, getQRCode } = require('../mongoControllers/settingsController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get('/company', protect, adminOnly, getCompanySettings);
router.put('/company', protect, adminOnly, upload.single('qr_code_image'), updateCompanySettings);
router.get('/company/qr', protect, getQRCode);

module.exports = router;
