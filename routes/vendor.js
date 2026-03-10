const express = require('express');
const router = express.Router();
const vendorCtrl = require('../modules/vendor/vendor');

router.get('/dashboard', vendorCtrl.vendorDashboard);
router.get('/orders', vendorCtrl.vendorOrders);
router.get('/ledger', vendorCtrl.vendorLedger);

module.exports = router;
