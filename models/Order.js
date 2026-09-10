const mongoose = require("mongoose");
const { Schema } = mongoose;

const ORDER_STATUSES = ["pending_payment", "paid", "processing", "shipped", "completed", "cancelled"];

const OrderSchema = new Schema(
  {
    buyer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: { type: String, required: true },
    productImage: { type: String },

    quantity: { type: Number, required: true, min: 1, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NGN" },

    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending_payment",
    },

    paymentReference: { type: String, required: true, unique: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    paidAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String },

    // Optional buyer-supplied delivery destination. Presence of deliveryAddress
    // is what triggers auto-creation of a Delivery once payment succeeds.
    deliveryAddress: { type: String },
    deliveryCoords: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },
  },
  { timestamps: true },
);

OrderSchema.index({ buyer: 1, createdAt: -1 });
OrderSchema.index({ vendor: 1, createdAt: -1 });

const OrderModel = mongoose.models.Order || mongoose.model("Order", OrderSchema);

module.exports = OrderModel;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
