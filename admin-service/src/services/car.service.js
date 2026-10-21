const prisma = require("../config/prisma");
const { BadRequestError, ConflictError, NotFoundError } = require("../utils/error");
const adminProducer = require('../kafka/producer/admin.producer');
const logger = require("../config/logger");
const { cancelUpcomingTripsForCar } = require('./ride.service');

const CATEGORIES = ['HATCHBACK', 'SEDAN', 'SUV', 'MUV', 'LUXURY'];
const TRANSMISSIONS = ['MANUAL', 'AUTOMATIC'];
const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID'];
const STATUSES = ['ACTIVE', 'MAINTENANCE', 'RETIRED'];

/**
 * Event payload shared by CAR_CREATED / CAR_UPDATED — carries everything
 * inventory-service and search-service need so they never call back into admin.
 */
const toCarEvent = (car) => ({
     carId: car.id,
     registrationNumber: car.registrationNumber,
     make: car.make,
     model: car.model,
     year: car.year,
     category: car.category,
     transmission: car.transmission,
     fuelType: car.fuelType,
     seats: car.seats,
     dailyRate: car.dailyRate,
     imageUrl: car.imageUrl,
     status: car.status,
     branch: {
          branchId: car.branch.id,
          name: car.branch.name,
          code: car.branch.code,
          city: car.branch.city,
     },
});

const validateCarFields = ({ category, transmission, fuelType, seats, dailyRate, year }) => {
     if (category && !CATEGORIES.includes(category)) {
          throw new BadRequestError(`category must be one of ${CATEGORIES.join(', ')}`);
     }
     if (transmission && !TRANSMISSIONS.includes(transmission)) {
          throw new BadRequestError(`transmission must be one of ${TRANSMISSIONS.join(', ')}`);
     }
     if (fuelType && !FUEL_TYPES.includes(fuelType)) {
          throw new BadRequestError(`fuelType must be one of ${FUEL_TYPES.join(', ')}`);
     }
     if (seats !== undefined && (!Number.isInteger(seats) || seats < 2 || seats > 12)) {
          throw new BadRequestError('seats must be an integer between 2 and 12');
     }
     if (dailyRate !== undefined && (typeof dailyRate !== 'number' || dailyRate <= 0)) {
          throw new BadRequestError('dailyRate must be a positive number');
     }
     const maxYear = new Date().getFullYear() + 1;
     if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > maxYear)) {
          throw new BadRequestError(`year must be between 2000 and ${maxYear}`);
     }
};

const createCar = async (data) => {
     validateCarFields(data);

     const registrationNumber = data.registrationNumber.replace(/\s+/g, '').toUpperCase();
     const existing = await prisma.car.findUnique({ where: { registrationNumber } });
     if (existing) {
          throw new ConflictError("Car with this registration number already exists");
     }

     const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
     if (!branch) {
          throw new NotFoundError('Branch not found');
     }

     const car = await prisma.car.create({
          data: {
               registrationNumber,
               make: data.make,
               model: data.model,
               year: data.year,
               category: data.category,
               transmission: data.transmission,
               fuelType: data.fuelType,
               seats: data.seats,
               dailyRate: data.dailyRate,
               imageUrl: data.imageUrl || null,
               branchId: data.branchId,
          },
          include: { branch: true },
     });

     // Inventory and search both build their read models from this event
     await adminProducer.publishCarCreated(toCarEvent(car));
     logger.info(`Car ${car.registrationNumber} added to fleet at ${branch.code}`);

     return car;
};

const updateCar = async (carId, data) => {
     validateCarFields(data);

     const car = await prisma.car.findUnique({ where: { id: carId } });
     if (!car) throw new NotFoundError('Car not found');

     if (data.branchId) {
          const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
          if (!branch) throw new NotFoundError('Branch not found');
     }

     const allowed = ['dailyRate', 'imageUrl', 'branchId', 'seats'];
     const updateData = Object.fromEntries(
          Object.entries(data).filter(([k, v]) => allowed.includes(k) && v !== undefined)
     );

     const updated = await prisma.car.update({
          where: { id: carId },
          data: updateData,
          include: { branch: true },
     });

     await adminProducer.publishCarUpdated(toCarEvent(updated));
     return updated;
};

const updateCarStatus = async (carId, status) => {
     if (!STATUSES.includes(status)) {
          throw new BadRequestError(`status must be one of ${STATUSES.join(', ')}`);
     }

     const car = await prisma.car.findUnique({ where: { id: carId } });
     if (!car) throw new NotFoundError('Car not found');
     if (car.status === status) return car;
     if (car.status === 'RETIRED') throw new BadRequestError('A retired car cannot be re-activated');

     const updated = await prisma.car.update({
          where: { id: carId },
          data: { status },
          include: { branch: true },
     });

     // Its scheduled shared-ride trips can't run either
     if (status !== 'ACTIVE') {
          const cancelled = await cancelUpcomingTripsForCar(carId);
          if (cancelled) logger.info(`Cancelled ${cancelled} upcoming trip(s) for car ${car.registrationNumber}`);
     }

     // Taking a car off the fleet cancels its upcoming bookings (booking-service)
     // and hides it from search (search-service).
     await adminProducer.publishCarStatusChanged({
          carId,
          previousStatus: car.status,
          status,
     });

     logger.info(`Car ${car.registrationNumber} status ${car.status} -> ${status}`);
     return updated;
};

const getAllCars = async (query = {}) => {
     const where = {};
     if (query.branchId) where.branchId = query.branchId;
     if (query.status) where.status = query.status.toUpperCase();
     if (query.category) where.category = query.category.toUpperCase();

     return prisma.car.findMany({
          where,
          include: { branch: true },
          orderBy: [{ branch: { city: 'asc' } }, { make: 'asc' }, { model: 'asc' }],
     });
};

const getCarById = async (id) => {
     const car = await prisma.car.findUnique({
          where: { id },
          include: { branch: true },
     });
     if (!car) throw new NotFoundError('Car not found');
     return car;
};

module.exports = { createCar, updateCar, updateCarStatus, getAllCars, getCarById };
