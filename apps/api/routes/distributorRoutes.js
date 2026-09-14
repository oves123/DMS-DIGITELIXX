const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getDistributors, getDistributorById, getFile, addDistributor, updateDistributor, deleteDistributor, bulkUploadDistributors, getWalletBalance } = require('../mongoControllers/distributorController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', protect, adminOnly, getDistributors);
router.get('/:id', protect, getDistributorById);
router.get('/:id/wallet', protect, getWalletBalance);
router.get('/:id/file/:type', protect, adminOnly, getFile);
router.post('/bulk', protect, adminOnly, bulkUploadDistributors);
router.post('/', protect, adminOnly, upload.fields([{ name: 'panFile', maxCount: 1 }, { name: 'aadharFile', maxCount: 1 }, { name: 'photoFile', maxCount: 1 }]), addDistributor);
router.put('/:id', protect, adminOnly, upload.fields([{ name: 'panFile', maxCount: 1 }, { name: 'aadharFile', maxCount: 1 }, { name: 'photoFile', maxCount: 1 }]), updateDistributor);
router.delete('/:id', protect, adminOnly, deleteDistributor);

module.exports = router;
