const express = require('express');
const router = express.Router();
const multer = require('multer');
const { submitClaim, getClaims, getDistributorClaims, updateClaimStatus, getClaimImage } = require('../mongoControllers/claimsController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Distributor endpoints
router.post('/submit', protect, upload.single('image'), submitClaim);
router.get('/distributor/:distributor_id', protect, getDistributorClaims);

// Admin Routes
router.get('/', protect, getClaims);
router.get('/:claim_id/image', protect, getClaimImage);
router.put('/:claim_id/status', protect, adminOnly, updateClaimStatus);

module.exports = router;
