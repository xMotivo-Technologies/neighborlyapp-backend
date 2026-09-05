const express = require("express");
const { authToken } = require("../../middleware/auth");
const { becomeAVendor } = require("../../controller/vendor/becomeAVendor");

const router = express.Router();

router.post("/vendor/apply", authToken, becomeAVendor);

module.exports = router;
