const asyncHandler = require("../utils/asyncHandler");
const { BadRequestError } = require('../utils/error')
const branchService = require('../services/branch.service');


exports.createBranch = asyncHandler(async (req, res) => {
     const { name, code, city, state, address, openTime, closeTime } = req.body;

     if (!name || !code || !city) {
          throw new BadRequestError('name, code and city are required');
     }

     const branch = await branchService.createBranch({
          code: code.toUpperCase(),
          name,
          city,
          state: state || null,
          address: address || null,
          ...(openTime && { openTime }),
          ...(closeTime && { closeTime }),
     });

     res.status(201).json({
          success: true,
          message: 'Branch Created Successfully',
          data: branch
     })
})


exports.getAllBranches = asyncHandler(async (req, res) => {
     const page = parseInt(req.query.page) || 1;
     const limit = parseInt(req.query.limit) || 50;
     const search = req.query.search;

     const result = await branchService.getAllBranches(page, limit, search);

     res.status(200).json({
          success: true,
          data: result.branches,
          pagination: {
               page,
               limit,
               total: result.total,
               totalPages: Math.ceil(result.total / limit)
          }
     });
});

exports.getBranchById = asyncHandler(async (req, res) => {
     const { branchId } = req.params;
     if (!branchId) {
          throw new BadRequestError("Branch Id is missing");
     }
     const branch = await branchService.getBranchById(branchId);

     res.status(200).json({
          success: true,
          data: branch
     });
});

exports.getBranchByIdInternal = asyncHandler(async (req, res) => {
     const { branchId } = req.params;
     if (!branchId) {
          throw new BadRequestError("Branch Id is missing");
     }
     const branch = await branchService.getBranchById(branchId);

     res.status(200).json({
          success: true,
          data: branch ? {
               id: branch.id,
               name: branch.name,
               code: branch.code,
               city: branch.city,
               address: branch.address,
          } : null
     });
});
