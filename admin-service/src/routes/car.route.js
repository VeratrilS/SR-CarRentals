const express = require('express');
const { createCar, updateCar, updateCarStatus, getAllCars, getCarById } = require('../controllers/car.controller');
const { getUserContext, requireAdminRole } = require('../middlewares/getUserContext.middleware');

const router = express.Router();

router.post("/car", getUserContext, requireAdminRole, createCar);
router.get("/car", getUserContext, requireAdminRole, getAllCars);
router.get("/car/:carId", getUserContext, requireAdminRole, getCarById);
router.put("/car/:carId", getUserContext, requireAdminRole, updateCar);
router.patch("/car/:carId/status", getUserContext, requireAdminRole, updateCarStatus);

module.exports = router;
