const express = require("express");
const { authToken, isVendor } = require("../../middleware/auth");
const {
  requestAdvert,
  getUserAdverts,
} = require("../../controller/advert/advertController");

const router = express.Router();

router.post("/runadvert", authToken, isVendor, requestAdvert);
router.get("/runadvert", authToken, isVendor, getUserAdverts);

module.exports = router;
