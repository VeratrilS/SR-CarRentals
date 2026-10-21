const express = require('express');
const { createBranch, getAllBranches, getBranchById, getBranchByIdInternal } = require('../controllers/branch.controller');

const { getUserContext } = require('../middlewares/getUserContext.middleware');
const { internalAuth } = require('../middlewares/internalAuth.middleware');

const router = express.Router();

router.get("/branch/internal/:branchId", internalAuth, getBranchByIdInternal);

router.get("/branch", getUserContext, getAllBranches);
router.get("/branch/:branchId", getUserContext, getBranchById);
router.post("/branch", getUserContext, createBranch);

module.exports = router;
