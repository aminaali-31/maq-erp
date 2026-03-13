const express = require('express');
const router = express.Router();
const customerController = require('../modules/customer/customer')
const complaints = require('../modules/customer/complaints')
const {isCustomer} = require('../middlewares/auth');
const authenticateAndAuthorize = require('../middlewares/inventory')

router.get('/portal', isCustomer, customerController.portal);
router.get('/orders', isCustomer, customerController.orders);
router.get('/ledger', isCustomer, customerController.ledger);
router.get('/complaints', isCustomer, customerController.complaints);
router.post('/complaints/add', isCustomer, customerController.addComplaint);
router.post('/complaints/:id/feedback', isCustomer, customerController.addFeedback);
router.post('/orders/:id/feedback', isCustomer, customerController.addOrderFeedback);
router.get('/orders/:id', isCustomer, customerController.orderDetails);

router.get('/view/complaints', authenticateAndAuthorize([1,3]), complaints.listComplaints);
router.get('/view/complaints/status/:id', authenticateAndAuthorize([1,3]), complaints.changeComplaintStatus);
module.exports = router;