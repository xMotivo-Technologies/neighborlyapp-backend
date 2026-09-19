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
    // totalAmount = (unitPrice * quantity) + deliveryFee — the exact figure charged via Paystack.
    totalAmount: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    deliveryDistanceKm: { type: Number, required: true, min: 0 },
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

    // Delivery is mandatory on every order — the buyer's supplied destination,
    // used both to charge the delivery fee up front and, once payment is
    // verified, to create the Delivery a rider will pick up.
    deliveryAddress: { type: String, required: true },
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
