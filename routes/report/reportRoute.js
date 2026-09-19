const express = require("express");
const { authToken } = require("../../middleware/auth");
const { createReport } = require("../../controller/report/reportController");

const router = express.Router();

router.post("/reports", authToken, createReport);

module.exports = router;
