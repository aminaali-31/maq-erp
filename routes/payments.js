const express = require('express');
const router = express.Router();
const authenticateAndAuthorize = require('../middlewares/inventory');

const paymentController = require('../modules/payments/payment');

router.get('/add',authenticateAndAuthorize([1,2,3]), paymentController.showPaymentForm);
router.post('/add', authenticateAndAuthorize([1,2,3]),paymentController.createPayment);
router.get('/', authenticateAndAuthorize([1,2,3]),paymentController.listPayments);

module.exports = router;