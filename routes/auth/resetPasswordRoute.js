const express = require("express");
const { authToken } = require("../../middleware/auth");
const {
  forgotPassword,
  verifyOtp,
  resetPassword,
} = require("../../controller/auth/resetPasswordController");
const { passwordResetRequestLimiter } = require("../../middleware/rateLimit");
const router = express.Router();

router.post("/auth/password-reset/request", passwordResetRequestLimiter, forgotPassword);
router.post("/auth/verify-otp", verifyOtp);
router.post("/auth/password-reset/confirm", resetPassword);

module.exports = router;