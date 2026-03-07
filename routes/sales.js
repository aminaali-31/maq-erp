const express = require('express');
const router = express.Router();
const quotationController = require('../modules/sales/quotations');
const salesController = require('../modules/sales/sales');
const invoiceController = require('../modules/sales/invoice')
const authenticateAndAuthorize = require('../middlewares/inventory');
// List all quotations
router.get('/quotations',authenticateAndAuthorize([1,2]), quotationController.listQuotations);

// Show form to create new quotation
router.get('/quotations/add', authenticateAndAuthorize([1,2]), quotationController.addQuotationForm);

// Handle form submission
router.post('/quotations/add',authenticateAndAuthorize([1,2]), quotationController.createQuotation);

// View a single quotation
router.get('/quotations/:id', authenticateAndAuthorize([1,2]),quotationController.viewQuotation);

// Create sales order
router.get('/orders/new', authenticateAndAuthorize([1,3]), salesController.showOrderForm);

router.post('/orders/new' ,authenticateAndAuthorize([1,3]), salesController.createSalesOrder);

router.get('/orders', salesController.listSalesOrders);

router.post('/orders/status', salesController.updateOrderStatus);

router.get('/orders/view/:id', salesController.viewSalesOrder);

router.get("/invoices/add", invoiceController.showInvoiceForm);

router.post("/invoices/create", invoiceController.createInvoice);

router.get("/invoices", invoiceController.listInvoices);

module.exports = router;