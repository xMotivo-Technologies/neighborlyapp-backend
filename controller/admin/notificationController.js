const UserModel = require("../../models/User");
const { notifyMany, TEMPLATES } = require("../../services/notificationService");

/**
 * POST /api/admin/notifications/promotion
 * Broadcasts a promotional notification to all active users respecting promotional preferences.
 */
const sendPromotion = async (req, res) => {
  try {
    const { title, body, message, data } = req.body;
    const content = body || message;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and body are required" });
    }

    // Acknowledge receipt immediately so admin HTTP request does not wait on batch push
    res.status(202).json({
      message: "Promotion broadcast initiated",
    });

    const users = await UserModel.find({
      isDeleted: { $ne: true },
      status: "active",
    }).select("_id");

    const userIds = users.map((u) => u._id);

    notifyMany({
      recipientIds: userIds,
      template: TEMPLATES.PROMOTION(title, content),
      data: data || {},
    }).catch((err) => {
      console.error("Bulk promotion dispatch error:", err);
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ message: "Server error" });
    }
    console.error("sendPromotion error:", error);
  }
};

module.exports = { sendPromotion };
