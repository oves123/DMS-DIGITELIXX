const express = require('express');
const router = express.Router();
const { loginUser, resetPassword } = require('../mongoControllers/authController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// POST /api/auth/login
router.post('/login', loginUser);

// PUT /api/auth/reset-password
router.put('/reset-password', protect, adminOnly, resetPassword);

module.exports = router;
