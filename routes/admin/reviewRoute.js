const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const { hideReview } = require("../../controller/admin/reviewModeration");

const router = express.Router();

router.put("/reviews/:id/hide", verifyAdmin, hideReview);

module.exports = router;
