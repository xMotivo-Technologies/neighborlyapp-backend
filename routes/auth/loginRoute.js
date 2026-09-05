const express = require("express");
const {
  handleLogin,
  handleLogout,
} = require("../../controller/auth/loginController");
const { refreshTokenHandler } = require("../../controller/auth/refreshTokenController");
const { loginLimiter, refreshLimiter } = require("../../middleware/rateLimit");
const router = express.Router();

router.post("/login", loginLimiter, handleLogin);
router.post("/refresh", refreshLimiter, refreshTokenHandler);
router.post("/logout", handleLogout);

module.exports = router;