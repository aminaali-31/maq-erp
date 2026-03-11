const express = require('express');
const router = express.Router();
const inventoryController = require('../modules/inventory/inven.controller');
const authenticateAndAuthorize = require('../middlewares/inventory');

router.get('/add', authenticateAndAuthorize([1,3]), inventoryController.products);
router.post('/add', authenticateAndAuthorize([1,3]), inventoryController.addProduct);

router.get('/category', authenticateAndAuthorize([1,3]), (req,res) => res.render('inventory/category'));
router.post('/category', 
    authenticateAndAuthorize([1,3]),
    inventoryController.addCategory
);

router.get('/allProducts',authenticateAndAuthorize([1,3]),inventoryController.getAllProducts);

// Show edit form
router.get('/products/:id/edit',authenticateAndAuthorize([1,3]), inventoryController.editProductForm);

// Update product
router.post('/products/:id/edit', authenticateAndAuthorize([1,3]),inventoryController.updateProduct);

//Show stock movements
router.get('/stock-movements', authenticateAndAuthorize([1,3]),inventoryController.listStockMovements);
module.exports = router;