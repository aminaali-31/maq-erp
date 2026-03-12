const express = require("express");
const router = express.Router();
const { getPendingApprovals, approveRole} = require("../modules/auth/auth.controller");
const ceoController = require('../modules/auth/ceo');
const pedningController = require('../modules/main/dashboard');
const  authenticateAndAuthorize  = require('../middlewares/inventory');

router.get('/approvals', authenticateAndAuthorize([1]), getPendingApprovals);
router.post('/approve/:approvalId', authenticateAndAuthorize([1]), approveRole);
router.get('/pendings', authenticateAndAuthorize([1,3]), pedningController.getDashboard);
router.get('/dashboard', authenticateAndAuthorize([1]), ceoController.dashboard);

router.get('/jobs/create', ceoController.createJobForm);
router.post('/jobs/create', ceoController.createJob);
router.get('/jobs/all', ceoController.showAllJobs);

module.exports = router;