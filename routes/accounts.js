const express = require('express');
const router = express.Router();
const authenticateAndAuthorize = require('../middlewares/inventory');

const accountController = require('../modules/payments/account')

router.get('/summary', accountController.accountSummary);
router.get('/ledger/:id', accountController.showLedger);

module.exports = router;