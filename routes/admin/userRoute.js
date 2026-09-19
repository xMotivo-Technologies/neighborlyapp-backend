const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const {
  listUsers,
  getUserById,
  suspendUser,
  unsuspendUser,
  banUser,
  unbanUser,
  adminResetPassword,
  deleteUser,
} = require("../../controller/admin/userController");

const router = express.Router();

router.get("/users", verifyAdmin, listUsers);
router.get("/users/:id", verifyAdmin, getUserById);
router.put("/users/:id/suspend", verifyAdmin, suspendUser);
router.put("/users/:id/unsuspend", verifyAdmin, unsuspendUser);
router.put("/users/:id/ban", verifyAdmin, banUser);
router.put("/users/:id/unban", verifyAdmin, unbanUser);
router.post("/users/:id/reset-password", verifyAdmin, adminResetPassword);
router.delete("/users/:id", verifyAdmin, deleteUser);

module.exports = router;
