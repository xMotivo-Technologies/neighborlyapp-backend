const mongoose = require("mongoose");
const { Schema } = mongoose;

const ORDER_STATUSES = ["pending_payment", "paid", "processing", "shipped", "completed", "cancelled"];

// One Order = one vendor. A buyer's cart can span several vendors, but since
// each vendor has its own pickup point (and therefore its own delivery
// distance/fee), a single checkout is split into one Order per vendor. All
// Orders born from the same checkout share `orderGroup` and `paymentReference`
// so a single Paystack transaction can pay for all of them at once.
const OrderItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: { type: String, required: true },
    productImage: { type: String },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    // lineTotal = unitPrice * quantity, snapshotted at purchase time.
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const OrderSchema = new Schema(
  {
    // Shared by every sibling Order created from the same checkout.
    orderGroup: { type: String, required: true },

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
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "An order must have at least one item",
      },
    },

    // totalAmount = sum of item lineTotals + deliveryFee — the exact figure
    // this vendor's share of the checkout was charged for.
    totalAmount: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    deliveryDistanceKm: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NGN" },

    // Neighborly's cut of the item subtotal (not the delivery fee), snapshotted
    // from PlatformSettings at order creation so a later rate change never
    // rewrites what this order actually owed.
    platformCommissionPercent: { type: Number, required: true, min: 0, max: 100 },
    platformCommissionAmount: { type: Number, required: true, min: 0 },
    // vendorEarning = (sum of item lineTotals) - platformCommissionAmount.
    // Paid into the vendor's wallet once the buyer confirms delivery.
    vendorEarning: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending_payment",
    },

    // Shared across every Order in the same orderGroup (one Paystack charge
    // pays for all of them), so it's unique per-vendor rather than globally.
    paymentReference: { type: String, required: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    paidAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
    // Set when a cancelled order's captured payment is refunded via Paystack
    // (see refundOrderPayment in orderController.js). refundError is set
    // instead when the refund call itself fails — the cancellation still
    // goes through either way, so this is visible rather than silently lost.
    refundedAt: { type: Date },
    refundAmount: { type: Number, min: 0 },
    refundReference: { type: String },
    refundError: { type: String },
    // Set when crediting the vendor's wallet throws in confirmDelivery/
    // autoConfirmStaleDeliveries; cleared once a retry succeeds. Lets a
    // sweep find and retry orders that were completed but never paid out.
    vendorPayoutError: { type: String },
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
OrderSchema.index({ orderGroup: 1 });
OrderSchema.index({ paymentReference: 1, vendor: 1 }, { unique: true });

const OrderModel = mongoose.models.Order || mongoose.model("Order", OrderSchema);

module.exports = OrderModel;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
