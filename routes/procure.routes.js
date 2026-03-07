const express = require('express');
const router = express.Router();
const vendorsController = require('../modules/procure/vendor');
const poController = require('../modules/procure/purcahse');
const dashboardController = require('../modules/procure/dashboard');
const authenticateAndAuthorize = require('../middlewares/inventory');

// Show add vendor page (optional)
router.get('/addVendor', authenticateAndAuthorize([1,3]), (req, res) => {
    const message = req.query.message || null;
    res.render('procure/addVendor', { message });
});

// Add vendor
router.post('/addVendor', authenticateAndAuthorize([1,3]), vendorsController.addVendor);
// List all vendors
router.get('/allVendors', authenticateAndAuthorize([1,3]), vendorsController.getAllVendors);
router.get('/purchase-orders/add', authenticateAndAuthorize([1,3]), poController.showAddPOForm);
// Handle purchase order submission
router.post('/purchase-orders/add', authenticateAndAuthorize([1,3]), poController.addPurchaseOrder);
// List all purchase orders
router.get('/purchase-orders/all', authenticateAndAuthorize([1,3]), poController.listAllPOs);
// View single purchase order
router.get('/purchase-orders/view/:id', authenticateAndAuthorize([1,3]), poController.viewPO);

router.get('/purchase-orders/change-status/:id', authenticateAndAuthorize([1,3]), poController.changePOStatus);

router.get('/dashboard', dashboardController.getManagerDashboard);


module.exports = router;