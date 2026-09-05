const express = require("express");
const { authToken } = require("../../middleware/auth");
const {
  forgotPassword,
  verifyOtp,
  resetPassword,
} = require("../../controller/auth/resetPasswordController");
const { passwordResetRequestLimiter } = require("../../middleware/rateLimit");
const router = express.Router();

router.post("/forgot-password", passwordResetRequestLimiter, forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

module.exports = router;