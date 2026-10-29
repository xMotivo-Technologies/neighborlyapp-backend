const AdvertModel = require("../models/Advert");

// Called whenever a product becomes unsellable (rejected, marked sold/
// inactive, edited back to pending, or deleted) so a still-running paid
// boost doesn't keep advertising something buyers can no longer actually
// buy. The vendor already paid for the slot and the boost did run up to
// this point, so this stops it early rather than issuing a refund.
const cancelActiveAdvertsForProduct = async (productId) => {
  await AdvertModel.updateMany(
    { product: productId, status: "active", expiresAt: { $gt: new Date() } },
    { status: "cancelled", cancelledAt: new Date() },
  );
};

module.exports = { cancelActiveAdvertsForProduct };
