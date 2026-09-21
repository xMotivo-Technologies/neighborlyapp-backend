const mongoose = require("mongoose");
const { Schema } = mongoose;

const PushTicketSchema = new Schema(
  {
    ticketId: {
      type: String,
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

const PushTicketModel =
  mongoose.models.PushTicket || mongoose.model("PushTicket", PushTicketSchema);

module.exports = PushTicketModel;
