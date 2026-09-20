const mongoose = require("mongoose");
const { Schema } = mongoose;

// Singleton document (fixed _id) holding platform-wide commission rates.
// Orders/Deliveries snapshot the rate in effect at the time they're created,
// so changing a rate here only affects future orders, never past ones.
const PlatformSettingsSchema = new Schema(
  {
    _id: { type: String, default: "global" },
    // % of a vendor's item subtotal Neighborly keeps on every product sale.
    productCommissionPercent: { type: Number, required: true, default: 3, min: 0, max: 100 },
    // % of the delivery fee Neighborly keeps before paying the rider out.
    deliveryCommissionPercent: { type: Number, required: true, default: 15, min: 0, max: 100 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

const PlatformSettingsModel =
  mongoose.models.PlatformSettings || mongoose.model("PlatformSettings", PlatformSettingsSchema);

module.exports = PlatformSettingsModel;
