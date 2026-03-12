const express = require('express');
const router = express.Router();
const quotationController = require('../modules/sales/quotations');
const salesController = require('../modules/sales/sales');
const invoiceController = require('../modules/sales/invoice')
const authenticateAndAuthorize = require('../middlewares/inventory');
// List all quotations
router.get('/quotations',authenticateAndAuthorize([1,3]), quotationController.listQuotations);

// Show form to create new quotation
router.get('/quotations/add', authenticateAndAuthorize([1,3]), quotationController.addQuotationForm);

// Handle form submission
router.post('/quotations/add',authenticateAndAuthorize([1,3]), quotationController.createQuotation);

// View a single quotation
router.get('/quotations/:id', authenticateAndAuthorize([1,3]),quotationController.viewQuotation);

router.get('/quotes/:id', quotationController.viewClientQuotation);

// Create sales order
router.get('/orders/new', authenticateAndAuthorize([1,3]), salesController.showOrderForm);

router.post('/orders/new' ,authenticateAndAuthorize([1,3]), salesController.createSalesOrder);

router.get('/orders', authenticateAndAuthorize([1,3]),salesController.listSalesOrders);

router.post('/orders/status',authenticateAndAuthorize([1]), salesController.updateOrderStatus);

router.get('/orders/view/:id',authenticateAndAuthorize([1,3]), salesController.viewSalesOrder);

router.get("/invoices/add",authenticateAndAuthorize([1,3]), invoiceController.showInvoiceForm);

router.post("/invoices/create", authenticateAndAuthorize([1,3]),invoiceController.createInvoice);

router.get("/invoices",authenticateAndAuthorize([1,3]), invoiceController.listInvoices);

router.get('/orders/edit/:id', authenticateAndAuthorize([1,3]),salesController.editOrderForm);

router.post('/orders/edit/:id',authenticateAndAuthorize([1,3]), salesController.updateEditOrder);


module.exports = router;