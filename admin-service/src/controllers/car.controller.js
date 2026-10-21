const asyncHandler = require("../utils/asyncHandler");
const { BadRequestError } = require("../utils/error");
const carService = require('../services/car.service');

const REQUIRED_FIELDS = ['registrationNumber', 'make', 'model', 'year', 'category', 'transmission', 'fuelType', 'seats', 'dailyRate', 'branchId'];

exports.createCar = asyncHandler(async (req, res) => {
     const missing = REQUIRED_FIELDS.filter((f) => req.body[f] === undefined || req.body[f] === '');
     if (missing.length > 0) {
          throw new BadRequestError(`Missing required fields: ${missing.join(', ')}`);
     }

     const car = await carService.createCar({
          ...req.body,
          year: Number(req.body.year),
          seats: Number(req.body.seats),
          dailyRate: Number(req.body.dailyRate),
          category: String(req.body.category).toUpperCase(),
          transmission: String(req.body.transmission).toUpperCase(),
          fuelType: String(req.body.fuelType).toUpperCase(),
     });

     return res.status(201).json({
          success: true,
          message: "Car added to fleet",
          data: car
     })
})

exports.updateCar = asyncHandler(async (req, res) => {
     const { carId } = req.params;
     const { dailyRate, imageUrl, branchId, seats } = req.body;

     const car = await carService.updateCar(carId, {
          dailyRate: dailyRate !== undefined ? Number(dailyRate) : undefined,
          seats: seats !== undefined ? Number(seats) : undefined,
          imageUrl,
          branchId,
     });

     return res.status(200).json({ success: true, message: "Car updated", data: car });
});

exports.updateCarStatus = asyncHandler(async (req, res) => {
     const { carId } = req.params;
     const { status } = req.body;
     if (!status) {
          throw new BadRequestError("status is required");
     }

     const car = await carService.updateCarStatus(carId, String(status).toUpperCase());
     return res.status(200).json({ success: true, message: `Car is now ${car.status}`, data: car });
});

exports.getAllCars = asyncHandler(async (req, res) => {
     const cars = await carService.getAllCars(req.query);
     return res.status(200).json({
          success: true,
          data: cars
     })
})

exports.getCarById = asyncHandler(async (req, res) => {
     const { carId } = req.params;
     if (!carId) {
          throw new BadRequestError("Car Id is missing");
     }
     const car = await carService.getCarById(carId);
     return res.status(200).json({
          success: true,
          data: car
     })
})
