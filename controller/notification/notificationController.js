const mongoose = require("mongoose");
const NotificationModel = require("../../models/Notification");

/**
 * GET /api/notifications
 * List notifications for the authenticated user with pagination and optional filtering.
 */
const getNotifications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = { recipient: req.user._id };

    if (req.query.unreadOnly === "true" || req.query.unreadOnly === true) {
      filter.read = false;
    }
    if (req.query.channelId) {
      filter.channelId = req.query.channelId;
    }
    if (req.query.type) {
      filter.type = req.query.type;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "firstName lastName businessName"),
      NotificationModel.countDocuments(filter),
      NotificationModel.countDocuments({ recipient: req.user._id, read: false }),
    ]);

    return res.status(200).json({
      notifications,
      total,
      unreadCount,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET /api/notifications/unread-count
 * Fast endpoint for mobile app badges.
 */
const getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await NotificationModel.countDocuments({
      recipient: req.user._id,
      read: false,
    });

    return res.status(200).json({ unreadCount });
  } catch (error) {
    console.error("Get unread count error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * PUT /api/notifications/:id/read or PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
const markAsRead = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid notification ID" });
  }

  try {
    const notification = await NotificationModel.findOneAndUpdate(
      { _id: id, recipient: req.user._id },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({
      message: "Notification marked as read",
      notification,
    });
  } catch (error) {
    console.error("Mark notification as read error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * PUT /api/notifications/read-all or PATCH /api/notifications/read-all
 * Mark all notifications for the authenticated user as read.
 */
const markAllAsRead = async (req, res) => {
  try {
    const result = await NotificationModel.updateMany(
      { recipient: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );

    return res.status(200).json({
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Mark all notifications as read error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * DELETE /api/notifications/:id
 * Delete a specific notification from user inbox.
 */
const deleteNotification = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid notification ID" });
  }

  try {
    const notification = await NotificationModel.findOneAndDelete({
      _id: id,
      recipient: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Delete notification error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
