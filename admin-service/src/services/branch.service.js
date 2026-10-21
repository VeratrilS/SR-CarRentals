const prisma = require("../config/prisma");
const { ConflictError, NotFoundError } = require("../utils/error");
const logger = require('../config/logger');
const adminProducer = require('../kafka/producer/admin.producer');

const createBranch = async (data) => {
     const existing = await prisma.branch.findFirst({
          where: { OR: [{ code: data.code }, { name: data.name }] }
     });

     if (existing) {
          throw new ConflictError('Branch with this code or name already exists');
     }

     const branch = await prisma.branch.create({ data });

     logger.info('Branch Created', { id: branch.id, code: branch.code });

     // Publish event - fire and forget (non-critical)
     await adminProducer.publishBranchCreated(branch).catch((err) => {
          logger.error('Failed to publish branch created event', { error: err.message });
     });
     return branch;
}

const getAllBranches = async (page, limit, search) => {
     const skip = (page - 1) * limit;

     const where = search ? {
          OR: [
               { code: { contains: search, mode: 'insensitive' } },
               { name: { contains: search, mode: 'insensitive' } },
               { city: { contains: search, mode: 'insensitive' } }
          ]
     } : {};

     const [branches, total] = await Promise.all([
          prisma.branch.findMany({
               where,
               skip,
               take: limit,
               orderBy: [{ city: 'asc' }, { name: 'asc' }],
               include: { _count: { select: { cars: true } } },
          }),
          prisma.branch.count({ where })
     ]);

     return { branches, total };
};

const getBranchById = async (branchId) => {
     const branch = await prisma.branch.findUnique({
          where: { id: branchId }
     });

     if (!branch) {
          throw new NotFoundError('Branch not found');
     }

     return branch;
};


module.exports = { createBranch, getAllBranches, getBranchById };
