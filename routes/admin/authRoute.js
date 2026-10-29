const express = require("express");
const {
  handleAdminRegister,
  handleAdminLogin,
  handleAdminLogout,
} = require("../../controller/admin/authController");
const { loginLimiter, registerLimiter } = require("../../middleware/rateLimit");

const router = express.Router();

router.post("/register", registerLimiter, handleAdminRegister);
router.post("/login", loginLimiter, handleAdminLogin);
router.post("/logout", handleAdminLogout);

module.exports = router;
