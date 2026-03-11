const express = require("express");
const router = express.Router();
const { getPendingApprovals, approveRole} = require("../modules/auth/auth.controller");
const pedningController = require('../modules/main/dashboard');
const authenticateAndAuthorize = require('../middlewares/inventory')

router.get('/approvals',authenticateAndAuthorize([1]), getPendingApprovals);
router.post('/approve/:approvalId',authenticateAndAuthorize([1]), approveRole)
router.get('/pendings',pedningController.getDashboard);

module.exports = router;