const express = require('express');
const router = express.Router();
const authenticateAndAuthorize = require('../middlewares/inventory');

const paymentController = require('../modules/payments/payment');

router.get('/add', paymentController.showPaymentForm);
router.post('/add', paymentController.createPayment);
router.get('/', paymentController.listPayments);

module.exports = router;