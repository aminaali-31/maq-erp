const express = require('express');
const router = express.Router();
const authenticateAndAuthorize = require('../middlewares/inventory');
const expenseController = require('../modules/payments/expense')

const accountController = require('../modules/payments/account')

router.get('/summary', authenticateAndAuthorize([1,2]), accountController.accountSummary);
router.get('/ledger/:id', authenticateAndAuthorize([1,2]), accountController.showLedger);

router.get('/add',authenticateAndAuthorize([1,2]),  accountController.showAddAccount);

router.post('/add',authenticateAndAuthorize([1,2]),  accountController.storeAccount);

router.post('/expenses/add',authenticateAndAuthorize([1,2]),  expenseController.addExpense);

router.get('/expenses/add',authenticateAndAuthorize([1,2]),  expenseController.showExpenseForm);

router.get('/expenses',authenticateAndAuthorize([1,2]),  expenseController.listExpenses);

router.get('/payables',authenticateAndAuthorize([1,2]),  accountController.showPayable);

router.get('/receivables',authenticateAndAuthorize([1,2]),  accountController.showReceivable);

router.get('/allAccounts',authenticateAndAuthorize([1,2]),  accountController.showAllAccounts);

module.exports = router;