const express = require("express");
const router = express.Router();
const { getPendingApprovals, approveRole} = require("../modules/auth/auth.controller");
const authenticateAndAuthorize = require('../middlewares/inventory')

router.get('/approvals',authenticateAndAuthorize([1]), getPendingApprovals);
router.post('/approve/:approvalId',authenticateAndAuthorize([1]), approveRole)

module.exports = router;