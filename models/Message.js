const mongoose = require("mongoose");
const { Schema } = mongoose;

const MessageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date },
  },
  { timestamps: true },
);

MessageSchema.index({ conversation: 1, createdAt: -1 });

const MessageModel = mongoose.models.Message || mongoose.model("Message", MessageSchema);
module.exports = MessageModel;
