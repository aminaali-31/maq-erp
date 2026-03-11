const router = require('express').Router();
const controller = require('../modules/hr/employee');
const salaryController = require('../modules/hr/salary');
const  authenticateAndAuthorize  = require('../middlewares/inventory');

router.get('/dashboard',authenticateAndAuthorize([1,4]),  controller.showDashboard);

router.get('/add', authenticateAndAuthorize([1,4]),controller.showAddEmployeeForm);
router.post('/add', authenticateAndAuthorize([1,4]),controller.addEmployee);

router.get('/list', authenticateAndAuthorize([1,4]),controller.listEmployees);

router.get('/payroll/list', authenticateAndAuthorize([1,4]),salaryController.listPayroll);

router.get('/payroll/add', authenticateAndAuthorize([1,4]),salaryController.showPayrollForm);

router.post('/payroll/add', authenticateAndAuthorize([1,4]),salaryController.addPayroll);

module.exports = router;