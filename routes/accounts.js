const express = require('express');
const router = express.Router();
const authenticateAndAuthorize = require('../middlewares/inventory');
const expenseController = require('../modules/payments/expense')

const accountController = require('../modules/payments/account')

router.get('/summary', accountController.accountSummary);
router.get('/ledger/:id', accountController.showLedger);

router.get('/add', accountController.showAddAccount);

router.post('/add', accountController.storeAccount);

router.post('/expenses/add', expenseController.addExpense);

router.get('/expenses/add', expenseController.showExpenseForm);

router.get('/expenses', expenseController.listExpenses);

router.get('/payables', accountController.showPayable);

router.get('/receivables', accountController.showReceivable);

module.exports = router;