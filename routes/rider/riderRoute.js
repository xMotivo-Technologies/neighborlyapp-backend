const express = require("express");
const { authToken, isRider } = require("../../middleware/auth");
const {
  applyAsRider,
  getRiderProfile,
  updateRiderProfile,
  updateAvailability,
  updateLocation,
  getAvailableDeliveries,
  getBankOptions,
} = require("../../controller/rider/riderController");

const router = express.Router();

router.post("/riders/apply", authToken, applyAsRider);
router.get("/riders/profile", authToken, getRiderProfile);
router.put("/riders/profile", authToken, updateRiderProfile);
router.put("/riders/availability", authToken, isRider, updateAvailability);
router.put("/riders/location", authToken, isRider, updateLocation);
router.get("/riders/available-deliveries", authToken, isRider, getAvailableDeliveries);
router.get("/riders/banks", authToken, getBankOptions);

module.exports = router;
