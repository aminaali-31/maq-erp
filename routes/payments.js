const express = require('express');
const router = express.Router();
const authenticateAndAuthorize = require('../middlewares/inventory');

const paymentController = require('../modules/payments/payment');

router.get('/add',authenticateAndAuthorize([1,2]), paymentController.showPaymentForm);
router.post('/add', authenticateAndAuthorize([1,2]),paymentController.createPayment);
router.get('/', authenticateAndAuthorize([1,2]),paymentController.listPayments);

module.exports = router;