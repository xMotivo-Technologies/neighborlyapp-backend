const ConversationModel = require("../../models/Conversation");
const MessageModel = require("../../models/Message");
const UserModel = require("../../models/User");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { emitToUser } = require("../../utils/socket");
const { notify, TEMPLATES } = require("../../services/notificationService");

const PARTICIPANT_PREVIEW_FIELDS = "firstName lastName businessName role";

const participantsKeyFor = (idA, idB) => [idA.toString(), idB.toString()].sort().join("_");

const otherParticipantId = (conversation, userId) =>
  conversation.participants.find((p) => p.toString() !== userId.toString());

// Starts (or returns the existing) conversation between the logged-in user
// and recipientId. Chat is scoped to buyer<->vendor only — two plain buyers
// or two vendors can't open one — since that's the feature this was built
// for; there's no product/order context on the conversation itself, just an
// ongoing thread per pair, so the same thread is reused across every item
// they discuss.
const startConversation = async (req, res) => {
  const { recipientId } = req.body;

  if (!recipientId) {
    return res.status(400).json({ message: "recipientId is required" });
  }

  if (recipientId === req.user._id.toString()) {
    return res.status(400).json({ message: "You cannot start a conversation with yourself" });
  }

  try {
    const recipient = await UserModel.findById(recipientId);

    if (!recipient || recipient.isDeleted) {
      return res.status(404).json({ message: "User not found" });
    }

    const isValidPair = (req.user.role === "vendor") !== (recipient.role === "vendor");
    if (!isValidPair) {
      return res.status(400).json({ message: "Chat is only supported between a buyer and a vendor" });
    }

    const participantsKey = participantsKeyFor(req.user._id, recipientId);

    const conversation = await ConversationModel.findOneAndUpdate(
      { participantsKey },
      { $setOnInsert: { participantsKey, participants: [req.user._id, recipientId] } },
      { new: true, upsert: true },
    );

    return res.status(200).json({ conversation });
  } catch (error) {
    console.error("Start conversation error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const listConversations = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { participants: req.user._id };

    const [conversations, total] = await Promise.all([
      ConversationModel.find(filter)
        .populate("participants", PARTICIPANT_PREVIEW_FIELDS)
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ConversationModel.countDocuments(filter),
    ]);

    const data = conversations.map((conversation) => {
      const otherParticipant = conversation.participants.find(
        (p) => p._id.toString() !== req.user._id.toString(),
      );

      return {
        id: conversation._id,
        otherParticipant,
        lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        lastSender: conversation.lastSender,
        unreadCount: conversation.unreadCounts?.get(req.user._id.toString()) || 0,
      };
    });

    return res.status(200).json({
      data,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("List conversations error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getMessages = async (req, res) => {
  const { id } = req.params;

  try {
    const conversation = await ConversationModel.findById(id);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!conversation.participants.some((p) => p.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: "You are not part of this conversation" });
    }

    const { page, limit, skip } = getPagination(req.query);
    const filter = { conversation: id };

    const [messages, total] = await Promise.all([
      MessageModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      MessageModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      // Newest page comes back oldest-first within itself so the client can
      // render it top-to-bottom without a reverse step.
      data: messages.reverse(),
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get messages error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const sendMessage = async (req, res) => {
  const { id } = req.params;
  const { body } = req.body;

  if (!body || !body.trim()) {
    return res.status(400).json({ message: "body is required" });
  }

  try {
    const conversation = await ConversationModel.findById(id);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!conversation.participants.some((p) => p.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: "You are not part of this conversation" });
    }

    const recipientId = otherParticipantId(conversation, req.user._id);
    const trimmedBody = body.trim().slice(0, 2000);

    const message = await MessageModel.create({
      conversation: id,
      sender: req.user._id,
      recipient: recipientId,
      body: trimmedBody,
    });

    conversation.lastMessage = trimmedBody.slice(0, 200);
    conversation.lastMessageAt = message.createdAt;
    conversation.lastSender = req.user._id;
    const recipientKey = recipientId.toString();
    conversation.unreadCounts.set(recipientKey, (conversation.unreadCounts.get(recipientKey) || 0) + 1);
    await conversation.save();

    emitToUser(recipientId, "chat:new_message", { conversationId: id, message });

    const senderName = req.user.firstName ? `${req.user.firstName} ${req.user.lastName || ""}`.trim() : null;
    notify({
      recipientId,
      template: TEMPLATES.NEW_MESSAGE(senderName),
      data: { conversationId: id.toString() },
    });

    return res.status(201).json({ message });
  } catch (error) {
    console.error("Send message error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const markRead = async (req, res) => {
  const { id } = req.params;

  try {
    const conversation = await ConversationModel.findById(id);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!conversation.participants.some((p) => p.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: "You are not part of this conversation" });
    }

    await MessageModel.updateMany(
      { conversation: id, recipient: req.user._id, readAt: null },
      { readAt: new Date() },
    );

    conversation.unreadCounts.set(req.user._id.toString(), 0);
    await conversation.save();

    const otherId = otherParticipantId(conversation, req.user._id);
    emitToUser(otherId, "chat:messages_read", { conversationId: id, readBy: req.user._id });

    return res.status(200).json({ message: "Messages marked as read" });
  } catch (error) {
    console.error("Mark messages read error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  startConversation,
  listConversations,
  getMessages,
  sendMessage,
  markRead,
};
