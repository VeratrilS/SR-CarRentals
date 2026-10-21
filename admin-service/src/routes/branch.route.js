const express = require('express');
const { createBranch, getAllBranches, getBranchById, getBranchByIdInternal } = require('../controllers/branch.controller');

const { getUserContext, requireAdminRole } = require('../middlewares/getUserContext.middleware');
const { internalAuth } = require('../middlewares/internalAuth.middleware');

const router = express.Router();

router.get("/branch/internal/:branchId", internalAuth, getBranchByIdInternal);

router.get("/branch", getUserContext, requireAdminRole, getAllBranches);
router.get("/branch/:branchId", getUserContext, requireAdminRole, getBranchById);
router.post("/branch", getUserContext, requireAdminRole, createBranch);

module.exports = router;
