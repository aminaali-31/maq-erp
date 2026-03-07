const router = require('express').Router();
const controller = require('../modules/hr/employee');
const salaryController = require('../modules/hr/salary');

router.get('/dashboard', controller.showDashboard);

router.get('/add', controller.showAddEmployeeForm);
router.post('/add', controller.addEmployee);

router.get('/list', controller.listEmployees);

router.get('/payroll/list', salaryController.listPayroll);

router.get('/payroll/add', salaryController.showPayrollForm);

router.post('/payroll/add', salaryController.addPayroll);

module.exports = router;