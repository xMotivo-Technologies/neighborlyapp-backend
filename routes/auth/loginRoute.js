const express = require("express");
const {
  handleLogin,
  handleLogout,
} = require("../../controller/auth/loginController");
const { refreshTokenHandler } = require("../../controller/auth/refreshTokenController");
const { loginLimiter, refreshLimiter } = require("../../middleware/rateLimit");
const router = express.Router();

router.post("/auth/login", loginLimiter, handleLogin);
router.post("/auth/refresh", refreshLimiter, refreshTokenHandler);
router.post("/auth/logout", handleLogout);

module.exports = router;