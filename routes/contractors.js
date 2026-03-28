const express = require('express');
const router = express.Router();
const authenticateAndAuthorize = require('../middlewares/inventory');
const controller = require('../modules/contractor/contractor');

router.get('/all',authenticateAndAuthorize([1]), controller.viewContractors);
router.get('/add',authenticateAndAuthorize([1]), controller.showAddContractor);
router.post('/add',authenticateAndAuthorize([1]), controller.createContractor);
router.get('/allContracts',authenticateAndAuthorize([1,3]), controller.listContracts);
router.get('/addContract',authenticateAndAuthorize([1,3]), controller.showAddContractForm);
router.post('/addContract',authenticateAndAuthorize([1,3]), controller.createContract);
router.get('/view/:id', authenticateAndAuthorize([1,3]), controller.viewContract);
module.exports = router;
