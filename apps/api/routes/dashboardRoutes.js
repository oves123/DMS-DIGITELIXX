const express = require('express');
const router = express.Router();
const { getMetrics } = require('../mongoControllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');

router.get('/metrics', protect, getMetrics);

module.exports = router;
