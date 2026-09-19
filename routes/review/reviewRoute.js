const express = require("express");
const { authToken } = require("../../middleware/auth");
const { createReview, getUserReviews, getReviewById } = require("../../controller/review/reviewController");

const router = express.Router();

router.post("/reviews", authToken, createReview);
router.get("/users/:id/reviews", getUserReviews);
router.get("/reviews/:id", getReviewById);

module.exports = router;
