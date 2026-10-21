const express = require('express');
const { createCar, updateCar, updateCarStatus, getAllCars, getCarById } = require('../controllers/car.controller');
const { getUserContext } = require('../middlewares/getUserContext.middleware');

const router = express.Router();

router.post("/car", getUserContext, createCar);
router.get("/car", getUserContext, getAllCars);
router.get("/car/:carId", getUserContext, getCarById);
router.put("/car/:carId", getUserContext, updateCar);
router.patch("/car/:carId/status", getUserContext, updateCarStatus);

module.exports = router;
