const mongoose = require("mongoose");
const { Schema } = mongoose;

const ConversationSchema = new Schema(
  {
    // Exactly two participants. Order doesn't matter for querying ("find
    // conversations where I'm a participant" just matches the array), but
    // participantsKey below needs a stable order to dedupe a pair.
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 2,
        message: "A conversation must have exactly 2 participants",
      },
    },
    // Sorted "<idA>_<idB>" string, computed once at creation. Lets
    // findOrCreateConversation look up an existing pair with a single
    // unique-indexed query regardless of who initiated it this time.
    participantsKey: { type: String, required: true, unique: true },

    lastMessage: { type: String },
    lastMessageAt: { type: Date },
    lastSender: { type: Schema.Types.ObjectId, ref: "User" },

    // Keyed by participant id (string) -> unread count for that participant.
    // A Map rather than two named fields (e.g. buyerUnread/vendorUnread)
    // because either participant could in principle be on either side.
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true },
);

ConversationSchema.index({ participants: 1, lastMessageAt: -1 });

const ConversationModel = mongoose.models.Conversation || mongoose.model("Conversation", ConversationSchema);
module.exports = ConversationModel;
