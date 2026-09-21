const express = require("express");
const { authToken, isVendor } = require("../../middleware/auth");
const {
  getAdvertPlans,
  requestAdvert,
  verifyAdvertPayment,
  getUserAdverts,
  getNearbyAdverts,
} = require("../../controller/advert/advertController");

const router = express.Router();

router.get("/advert-plans", authToken, isVendor, getAdvertPlans);
router.post("/runadvert", authToken, isVendor, requestAdvert);
router.post("/runadvert/verify", authToken, isVendor, verifyAdvertPayment);
router.get("/runadvert", authToken, isVendor, getUserAdverts);
router.get("/adverts/nearby", getNearbyAdverts);

module.exports = router;
