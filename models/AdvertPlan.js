const mongoose = require("mongoose");
const { Schema } = mongoose;

// A selectable boost tier a vendor can buy (e.g. "1 Day", "7 Days", "2 Weeks").
// Admin manages these via /admin/advert-plans; an Advert snapshots the plan's
// name/price/durationDays at purchase time, so editing or removing a plan
// later never changes what an already-running boost cost or how long it runs.
const AdvertPlanSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    durationDays: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    // Lets admin retire a plan (hide it from vendors) without deleting it —
    // deleting is also fine since Adverts snapshot their own copy of the
    // plan's details and don't depend on it continuing to exist.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const AdvertPlanModel = mongoose.models.AdvertPlan || mongoose.model("AdvertPlan", AdvertPlanSchema);

module.exports = AdvertPlanModel;
