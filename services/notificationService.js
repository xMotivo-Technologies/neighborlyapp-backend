const { Expo } = require("expo-server-sdk");
const NotificationModel = require("../models/Notification");
const PushTicketModel = require("../models/PushTicket");
const DeviceTokenModel = require("../models/DeviceToken");
const UserModel = require("../models/User");
const RiderModel = require("../models/Rider");
const { TEMPLATES } = require("../utils/notifications/templates");

const expo = new Expo();

/**
 * Resolves a template argument whether passed as a pre-evaluated object or a zero-arg function.
 */
const resolvePayload = (template) => {
  if (!template) {
    return {
      title: "Notification",
      body: "",
      type: "system",
      channelId: "general",
    };
  }
  const payload = typeof template === "function" ? template() : template;
  return {
    title: payload.title || "Notification",
    body: payload.body || "",
    type: payload.type || "system",
    channelId: payload.channelId || "general",
  };
};

/**
 * Checks whether a user's notification preferences allow the specified channel.
 */
const isChannelAllowed = (user, channelId) => {
  if (user.notificationsEnabled === false) return false;
  if (!user.notificationPrefs) return true;

  if (channelId === "orders" && user.notificationPrefs.orders === false) return false;
  if (channelId === "deliveries" && user.notificationPrefs.deliveries === false) return false;
  if (channelId === "wallet" && user.notificationPrefs.wallet === false) return false;
  if (channelId === "promotions" && user.notificationPrefs.promotions === false) return false;
  if (channelId === "messages" && user.notificationPrefs.messages === false) return false;

  return true;
};

/**
 * Prunes an invalid or expired push token from User and DeviceToken collections.
 */
const pruneToken = async (userId, token) => {
  try {
    const promises = [DeviceTokenModel.deleteOne({ token })];
    if (userId) {
      promises.push(UserModel.findByIdAndUpdate(userId, { $pull: { expoTokens: token } }));
    } else {
      promises.push(UserModel.updateMany({ expoTokens: token }, { $pull: { expoTokens: token } }));
    }
    await Promise.all(promises);
  } catch (err) {
    console.error(`[NotificationService] Error pruning token ${token}:`, err);
  }
};

/**
 * Sends a chunk of Expo push notifications with exponential backoff retry.
 */
const sendChunkWithRetry = async (chunk, maxRetries = 3) => {
  let delay = 500;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
};

/**
 * Dispatches push messages via Expo with chunking, retries, ticket tracking, and immediate error pruning.
 * @param {Array<{ message: Object, token: string, userId: string }>} items
 */
const dispatchPushMessages = async (items) => {
  if (!items || items.length === 0) return;

  const messages = items.map((item) => item.message);
  const chunks = expo.chunkPushNotifications(messages);
  let globalIndex = 0;

  for (const chunk of chunks) {
    try {
      const ticketChunk = await sendChunkWithRetry(chunk);
      const ticketsToSave = [];

      for (let i = 0; i < ticketChunk.length; i++) {
        const ticket = ticketChunk[i];
        const item = items[globalIndex + i];

        if (!item) continue;

        if (ticket.status === "error") {
          console.error(
            `[NotificationService] Push ticket error for user ${item.userId}: ${ticket.message}`,
            ticket.details
          );
          if (ticket.details?.error === "DeviceNotRegistered") {
            await pruneToken(item.userId, item.token);
          }
        } else if (ticket.id) {
          ticketsToSave.push({
            ticketId: ticket.id,
            token: item.token,
            userId: item.userId,
          });
        }
      }

      if (ticketsToSave.length > 0) {
        await PushTicketModel.insertMany(ticketsToSave, { ordered: false }).catch((err) => {
          console.error("[NotificationService] Error saving push tickets:", err);
        });
      }
    } catch (chunkError) {
      console.error("[NotificationService] Failed to send push notification chunk:", chunkError);
    } finally {
      globalIndex += chunk.length;
    }
  }
};

/**
 * Sends an in-app and push notification to a single user.
 * Never throws to callers; executes safely and logs errors.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.recipientId - Target User ID
 * @param {Object|Function} params.template - Template object or function from TEMPLATES
 * @param {Object} [params.data={}] - Metadata payload for deep linking
 * @param {string|mongoose.Types.ObjectId} [params.senderId=null] - Optional sender User ID
 * @returns {Promise<Object|null>} The created Notification document or null
 */
const notify = async ({ recipientId, template, data = {}, senderId = null }) => {
  try {
    if (!recipientId) return null;

    const payload = resolvePayload(template);

    // 1. Persist in-app notification
    const audience = data.audience || "buyer";
    const notification = await NotificationModel.create({
      recipient: recipientId,
      sender: senderId || null,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      channelId: payload.channelId,
      data: {
        ...data,
        audience,
        type: payload.type,
        channelId: payload.channelId,
      },
    });

    // 2. Fetch user preferences & device tokens
    const user = await UserModel.findById(recipientId).select(
      "notificationsEnabled notificationPrefs expoTokens isDeleted status"
    );

    if (!user || user.isDeleted || user.status === "banned") {
      return notification;
    }

    if (!isChannelAllowed(user, payload.channelId)) {
      return notification;
    }

    // Combine tokens from User and DeviceToken models
    const deviceTokens = await DeviceTokenModel.find({ user: recipientId }).select("token");
    const allTokens = new Set([
      ...(user.expoTokens || []),
      ...deviceTokens.map((d) => d.token),
    ]);

    const validItems = [];
    for (const token of allTokens) {
      if (Expo.isExpoPushToken(token)) {
        validItems.push({
          token,
          userId: recipientId,
          message: {
            to: token,
            sound: "default",
            title: payload.title,
            body: payload.body,
            data: {
              ...data,
              audience,
              notificationId: notification._id.toString(),
              type: payload.type,
              channelId: payload.channelId,
            },
            channelId: payload.channelId,
          },
        });
      }
    }

    if (validItems.length > 0) {
      await dispatchPushMessages(validItems);
    }

    return notification;
  } catch (error) {
    console.error("[NotificationService] notify() error:", error);
    return null;
  }
};

/**
 * Bulk notifies multiple users with in-app notification records and push delivery.
 *
 * @param {Object} params
 * @param {Array<string|mongoose.Types.ObjectId>} params.recipientIds - Target User IDs
 * @param {Object|Function} params.template - Template object or function
 * @param {Object} [params.data={}] - Metadata payload for deep linking
 * @param {string|mongoose.Types.ObjectId} [params.senderId=null] - Optional sender User ID
 */
const notifyMany = async ({ recipientIds, template, data = {}, senderId = null }) => {
  try {
    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return;
    }

    const uniqueIds = [...new Set(recipientIds.map((id) => id.toString()))];
    const payload = resolvePayload(template);

    // 1. Bulk insert in-app notifications
    const audience = data.audience || "buyer";
    const notificationDocs = uniqueIds.map((userId) => ({
      recipient: userId,
      sender: senderId || null,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      channelId: payload.channelId,
      data: {
        ...data,
        audience,
        type: payload.type,
        channelId: payload.channelId,
      },
    }));

    await NotificationModel.insertMany(notificationDocs, { ordered: false }).catch((err) => {
      console.error("[NotificationService] Error inserting bulk notifications:", err);
    });

    // 2. Fetch eligible recipients respecting notification preferences
    const users = await UserModel.find({
      _id: { $in: uniqueIds },
      isDeleted: { $ne: true },
      status: { $ne: "banned" },
      notificationsEnabled: { $ne: false },
    }).select("_id notificationPrefs expoTokens");

    const eligibleUsers = users.filter((u) => isChannelAllowed(u, payload.channelId));
    if (eligibleUsers.length === 0) return;

    const eligibleUserIds = eligibleUsers.map((u) => u._id);

    // Query active device tokens for these users
    const deviceDocs = await DeviceTokenModel.find({ user: { $in: eligibleUserIds } }).select(
      "user token"
    );

    const userTokenMap = new Map();
    for (const u of eligibleUsers) {
      userTokenMap.set(u._id.toString(), new Set(u.expoTokens || []));
    }
    for (const d of deviceDocs) {
      const uId = d.user.toString();
      if (!userTokenMap.has(uId)) {
        userTokenMap.set(uId, new Set());
      }
      userTokenMap.get(uId).add(d.token);
    }

    // Build push items
    const validItems = [];
    for (const [uId, tokens] of userTokenMap.entries()) {
      for (const token of tokens) {
        if (Expo.isExpoPushToken(token)) {
          validItems.push({
            token,
            userId: uId,
            message: {
              to: token,
              sound: "default",
              title: payload.title,
              body: payload.body,
              data: {
                ...data,
                audience,
                type: payload.type,
                channelId: payload.channelId,
              },
              channelId: payload.channelId,
            },
          });
        }
      }
    }

    if (validItems.length > 0) {
      await dispatchPushMessages(validItems);
    }
  } catch (error) {
    console.error("[NotificationService] notifyMany() error:", error);
  }
};

/**
 * Broadcasts an available delivery notification to nearby available approved riders.
 *
 * @param {Object} params
 * @param {Array<number>} params.pickupCoords - [longitude, latitude]
 * @param {number} [params.radiusKm=15] - Search radius in km
 * @param {Object|Function} params.template - Template (defaults to DELIVERY_AVAILABLE_RIDER)
 * @param {Object} [params.data={}] - Order/delivery metadata
 */
const broadcastToRiders = async ({
  pickupCoords,
  radiusKm = 15,
  template = TEMPLATES.DELIVERY_AVAILABLE_RIDER,
  data = {},
}) => {
  try {
    const query = {
      status: "approved",
      isAvailable: true,
    };

    if (
      pickupCoords &&
      Array.isArray(pickupCoords) &&
      pickupCoords.length === 2 &&
      typeof pickupCoords[0] === "number" &&
      typeof pickupCoords[1] === "number"
    ) {
      query.currentLocation = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: pickupCoords,
          },
          $maxDistance: radiusKm * 1000,
        },
      };
    }

    let riders = [];
    try {
      riders = await RiderModel.find(query).select("user");
    } catch (geoError) {
      console.warn(
        "[NotificationService] Geospatial query failed, falling back to all available approved riders:",
        geoError.message
      );
      riders = await RiderModel.find({ status: "approved", isAvailable: true }).select("user");
    }

    if (!riders || riders.length === 0) return;

    const recipientIds = riders.map((r) => r.user).filter(Boolean);
    await notifyMany({ recipientIds, template, data: { ...data, audience: "rider" } });
  } catch (error) {
    console.error("[NotificationService] broadcastToRiders() error:", error);
  }
};

let isCheckingReceipts = false;

/**
 * Periodic cron job: retrieves receipts for outstanding PushTickets, prunes
 * unregistered device tokens, and clears processed tickets.
 */
const checkReceipts = async () => {
  if (isCheckingReceipts) {
    console.log("[NotificationService] checkReceipts is already in progress, skipping run.");
    return;
  }

  isCheckingReceipts = true;
  try {
    const tickets = await PushTicketModel.find({}).limit(1000);
    if (tickets.length === 0) {
      // Housekeeping: delete any stale tickets older than 48 hours
      await PushTicketModel.deleteMany({
        createdAt: { $lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      });
      return;
    }

    const ticketMap = new Map();
    for (const t of tickets) {
      ticketMap.set(t.ticketId, t);
    }

    const ticketIds = Array.from(ticketMap.keys());
    const receiptIdChunks = expo.chunkPushNotificationReceiptIds(ticketIds);
    const ticketsToDelete = [];

    for (const chunk of receiptIdChunks) {
      try {
        const receipts = await expo.getPushNotificationReceiptsAsync(chunk);

        for (const receiptId of Object.keys(receipts)) {
          const receipt = receipts[receiptId];
          const ticket = ticketMap.get(receiptId);

          if (!ticket) continue;

          if (receipt.status === "error") {
            console.error(
              `[NotificationService] Receipt error for token ${ticket.token}: ${receipt.message}`,
              receipt.details
            );
            if (receipt.details?.error === "DeviceNotRegistered") {
              await pruneToken(ticket.userId, ticket.token);
            }
          }

          ticketsToDelete.push(ticket._id);
        }
      } catch (chunkError) {
        console.error("[NotificationService] Error fetching receipt chunk:", chunkError);
      }
    }

    if (ticketsToDelete.length > 0) {
      await PushTicketModel.deleteMany({ _id: { $in: ticketsToDelete } });
    }

    // Cleanup lingering tickets older than 48 hours
    await PushTicketModel.deleteMany({
      createdAt: { $lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });
  } catch (error) {
    console.error("[NotificationService] checkReceipts() error:", error);
  } finally {
    isCheckingReceipts = false;
  }
};

module.exports = {
  notify,
  notifyMany,
  broadcastToRiders,
  checkReceipts,
  pruneToken,
  TEMPLATES,
};
