const crypto = require("crypto");
const AdvertModel = require("../../models/Advert");
const AdvertPlanModel = require("../../models/AdvertPlan");
const ProductModel = require("../../models/Products");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { ensureDefaultPlans } = require("../../utils/advertPlans");
const { getPlatformSettings } = require("../../utils/platformSettings");
const { initializeTransaction, verifyTransaction } = require("../../utils/paystack");

const EARTH_RADIUS_KM = 6378.1;

const generatePaymentReference = () => `advert_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;

// The boost tiers a vendor can choose from (e.g. "1 Day", "7 Days", "2 Weeks").
// Public — a vendor needs to see prices before picking one.
const getAdvertPlans = async (req, res) => {
  try {
    await ensureDefaultPlans();
    const plans = await AdvertPlanModel.find({ isActive: true }).sort({ durationDays: 1 });
    return res.status(200).json({ data: plans });
  } catch (error) {
    console.error("Get advert plans error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Starts a boost purchase: picks a plan, snapshots its price/duration and the
// product's pickup location, and opens a Paystack transaction for the price.
// The boost only actually starts running once verifyAdvertPayment confirms
// payment — see that function for why.
const requestAdvert = async (req, res) => {
  const { productId, planId } = req.body;

  if (!productId || !planId) {
    return res.status(400).json({ message: "productId and planId are required" });
  }

  try {
    const [product, plan] = await Promise.all([
      ProductModel.findById(productId),
      AdvertPlanModel.findById(planId),
    ]);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You do not own this product" });
    }

    if (product.status !== "active") {
      return res.status(400).json({ message: "Only an active product listing can be boosted" });
    }

    if (!product.locationCoords?.coordinates || product.locationCoords.coordinates.length !== 2) {
      return res.status(400).json({ message: "This product has no pickup location set and cannot be boosted" });
    }

    if (!plan || !plan.isActive) {
      return res.status(404).json({ message: "Advert plan not found" });
    }

    const paymentReference = generatePaymentReference();

    const advert = await AdvertModel.create({
      vendor: req.user._id,
      product: product._id,
      plan: plan._id,
      planName: plan.name,
      durationDays: plan.durationDays,
      price: plan.price,
      pickupCoords: product.locationCoords,
      paymentReference,
    });

    let paystackData;
    try {
      const paystackResponse = await initializeTransaction({
        email: req.user.email,
        amount: Math.round(plan.price * 100),
        reference: paymentReference,
        metadata: {
          advertId: advert._id.toString(),
          productId: product._id.toString(),
          vendorId: req.user._id.toString(),
        },
      });
      paystackData = paystackResponse.data;
    } catch (paystackError) {
      console.error("Paystack initialize error:", paystackError);
      advert.paymentStatus = "failed";
      advert.status = "failed";
      await advert.save();
      return res.status(502).json({ message: "Unable to initialize payment" });
    }

    return res.status(201).json({
      message: "Boost created, proceed to payment",
      advert,
      payment: {
        authorizationUrl: paystackData.authorization_url,
        accessCode: paystackData.access_code,
        reference: paymentReference,
      },
    });
  } catch (error) {
    console.error("Request advert error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Confirms payment and starts the boost running. Payment is verified against
// Paystack directly (never trusting the client's say-so on success), and the
// charged amount is checked against what this boost was actually created for.
const verifyAdvertPayment = async (req, res) => {
  const { reference } = req.body;

  if (!reference) {
    return res.status(400).json({ message: "reference is required" });
  }

  try {
    const advert = await AdvertModel.findOne({ paymentReference: reference });

    if (!advert) {
      return res.status(404).json({ message: "Boost not found for this reference" });
    }

    if (advert.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "This boost does not belong to you" });
    }

    if (advert.paymentStatus === "success") {
      return res.status(200).json({ message: "Payment already verified", advert });
    }

    const { data: transaction } = await verifyTransaction(reference);

    if (transaction.status !== "success") {
      advert.paymentStatus = "failed";
      advert.status = "failed";
      await advert.save();
      return res.status(400).json({ message: "Payment was not successful" });
    }

    const expectedAmountKobo = Math.round(advert.price * 100);
    if (transaction.amount !== expectedAmountKobo) {
      advert.paymentStatus = "failed";
      advert.status = "failed";
      await advert.save();
      console.error(
        `Advert payment amount mismatch for ${advert._id}: expected ${expectedAmountKobo}, got ${transaction.amount}`,
      );
      return res.status(400).json({ message: "Payment amount mismatch" });
    }

    const startAt = new Date();
    advert.paymentStatus = "success";
    advert.status = "active";
    advert.startAt = startAt;
    advert.expiresAt = new Date(startAt.getTime() + advert.durationDays * 24 * 60 * 60 * 1000);
    await advert.save();

    return res.status(200).json({ message: "Boost is now running", advert });
  } catch (error) {
    console.error("Verify advert payment error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// A vendor's own boost history, oldest-status-agnostic — isRunning is derived
// here rather than stored, since "active" + expiresAt in the past just means
// the boost ran out, with no background job needed to flip a status field.
const getUserAdverts = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { vendor: req.user._id };

    const [adverts, total] = await Promise.all([
      AdvertModel.find(filter)
        .populate("product", "name price imgUrl")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AdvertModel.countDocuments(filter),
    ]);

    const now = new Date();
    const data = adverts.map((advert) => ({
      ...advert.toObject(),
      isRunning: advert.status === "active" && advert.expiresAt > now,
    }));

    return res.status(200).json({
      data,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get user adverts error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};


// Public buyer-facing feed: boosted products near the given location, nearest
// first. The visibility radius is read live from PlatformSettings on every
// call — an admin changing it takes effect immediately for every boost
// currently running, not just ones bought afterwards.
const getNearbyAdverts = async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ message: "lat and lng are required" });
  }

  try {
    const { page, limit, skip } = getPagination(req.query);
    const { advertRadiusKm } = await getPlatformSettings();
    const now = new Date();

    const baseFilter = { status: "active", expiresAt: { $gt: now } };

    // $near sorts by distance but MongoDB rejects it inside countDocuments()
    // (which runs as an aggregation $match), so counting uses an equivalent
    // $geoWithin filter over the same circle instead — same pattern as
    // getNearbyProducts in productController.js.
    const nearFilter = {
      ...baseFilter,
      pickupCoords: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: advertRadiusKm * 1000,
        },
      },
    };
    const countFilter = {
      ...baseFilter,
      pickupCoords: {
        $geoWithin: { $centerSphere: [[lng, lat], advertRadiusKm / EARTH_RADIUS_KM] },
      },
    };

    const [adverts, total] = await Promise.all([
      AdvertModel.find(nearFilter)
        .populate("product", "name price imgUrl location")
        .populate("vendor", "businessName businessAddress")
        .skip(skip)
        .limit(limit),
      AdvertModel.countDocuments(countFilter),
    ]);

    return res.status(200).json({
      data: adverts,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get nearby adverts error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAdvertPlans,
  requestAdvert,
  verifyAdvertPayment,
  getUserAdverts,
  getNearbyAdverts,
};
