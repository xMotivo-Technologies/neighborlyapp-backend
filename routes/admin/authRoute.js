const express = require("express");
const {
  handleAdminRegister,
  handleAdminLogin,
  handleAdminLogout,
} = require("../../controller/admin/authController");

const router = express.Router();

router.post("/register", handleAdminRegister);
router.post("/login", handleAdminLogin);
router.post("/logout", handleAdminLogout);

module.exports = router;
