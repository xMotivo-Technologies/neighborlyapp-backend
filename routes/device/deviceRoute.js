const express = require("express");
const { authToken } = require("../../middleware/auth");
const { registerDevice, removeDevice } = require("../../controller/device/deviceController");

const router = express.Router();

router.post("/devices", authToken, registerDevice);
router.delete("/devices", authToken, removeDevice);

module.exports = router;
