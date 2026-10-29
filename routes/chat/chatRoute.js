const express = require("express");
const { authToken } = require("../../middleware/auth");
const {
  startConversation,
  listConversations,
  getMessages,
  sendMessage,
  markRead,
} = require("../../controller/chat/chatController");

const router = express.Router();

router.post("/chat/conversations", authToken, startConversation);
router.get("/chat/conversations", authToken, listConversations);
router.get("/chat/conversations/:id/messages", authToken, getMessages);
router.post("/chat/conversations/:id/messages", authToken, sendMessage);
router.patch("/chat/conversations/:id/read", authToken, markRead);

module.exports = router;
