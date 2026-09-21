const express = require("express");
const { authToken } = require("../../middleware/auth");
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../../controller/notification/notificationController");

const router = express.Router();

router.get("/notifications", authToken, getNotifications);
router.get("/notifications/unread-count", authToken, getUnreadCount);
router.put("/notifications/read-all", authToken, markAllAsRead);
router.patch("/notifications/read-all", authToken, markAllAsRead);
router.put("/notifications/:id/read", authToken, markAsRead);
router.patch("/notifications/:id/read", authToken, markAsRead);
router.delete("/notifications/:id", authToken, deleteNotification);

module.exports = router;
