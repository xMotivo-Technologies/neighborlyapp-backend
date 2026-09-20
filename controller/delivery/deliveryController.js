const DeliveryModel = require("../../models/Delivery");
const OrderModel = require("../../models/Order");
const ProductModel = require("../../models/Products");
const RiderModel = require("../../models/Rider");
const { haversineDistanceKm, estimateDeliveryFee, estimateDurationMinutes } = require("../../utils/geo");
const { applyWalletEntry } = require("../../utils/walletLedger");

const RIDER_SETTABLE_STATUSES = ["picked_up", "in_transit", "delivered"];

// Called from the order controller once payment is verified. Distance/fee are
// NOT recomputed here — they're taken from the order's own snapshot, which is
// the exact figure the buyer was actually charged for delivery. Recomputing
// independently could drift from that (e.g. if the product's location changed
// in the gap between order creation and payment) and pay the rider a
// different amount than what was collected.
const createDeliveryForOrder = async (order) => {
  // All items on an order share one vendor/pickup point, so the first item's
  // product location is the pickup point for the whole order.
  const product = await ProductModel.findById(order.items[0].product);

  if (!product?.locationCoords?.coordinates || product.locationCoords.coordinates.length !== 2) {
    console.error(`Skipping delivery creation for order ${order._id}: product has no pickup location`);
    return null;
  }

  if (!order.deliveryCoords?.coordinates || order.deliveryCoords.coordinates.length !== 2) {
    console.error(`Skipping delivery creation for order ${order._id}: order has no delivery coordinates`);
    return null;
  }

  return DeliveryModel.create({
    order: order._id,
    vendor: order.vendor,
    buyer: order.buyer,
    pickupAddress: product.location,
    pickupCoords: product.locationCoords,
    dropoffAddress: order.deliveryAddress,
    dropoffCoords: order.deliveryCoords,
    distanceKm: order.deliveryDistanceKm,
    fee: order.deliveryFee,
    estimatedDurationMinutes: estimateDurationMinutes(order.deliveryDistanceKm),
  });
};

// Lets a buyer preview delivery cost/time before checkout. Pickup point comes
// from the product record; only the dropoff point is client-supplied.
const estimateDelivery = async (req, res) => {
  const { productId, lat, lng } = req.body;
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  if (!productId) {
    return res.status(400).json({ message: "productId is required" });
  }

  if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
    return res.status(400).json({ message: "lat and lng (dropoff location) are required" });
  }

  try {
    const product = await ProductModel.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (!product.locationCoords?.coordinates || product.locationCoords.coordinates.length !== 2) {
      return res.status(400).json({ message: "This product does not have a pickup location set" });
    }

    const [pickupLng, pickupLat] = product.locationCoords.coordinates;
    const distanceKm = haversineDistanceKm({ lat: pickupLat, lng: pickupLng }, { lat: parsedLat, lng: parsedLng });

    return res.status(200).json({
      distanceKm: Math.round(distanceKm * 100) / 100,
      fee: estimateDeliveryFee(distanceKm),
      estimatedDurationMinutes: estimateDurationMinutes(distanceKm),
    });
  } catch (error) {
    console.error("Estimate delivery error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Atomic claim: only succeeds if the delivery is still unassigned, so two
// riders racing on the same delivery can't both "win".
const acceptDelivery = async (req, res) => {
  const { id } = req.params;

  if (!req.rider.isAvailable) {
    return res.status(400).json({ message: "You must be available to accept deliveries" });
  }

  try {
    const delivery = await DeliveryModel.findOneAndUpdate(
      { _id: id, status: "pending", rider: null },
      { rider: req.user._id, status: "accepted", acceptedAt: new Date() },
      { new: true },
    );

    if (!delivery) {
      return res.status(409).json({ message: "Delivery is no longer available" });
    }

    try {
      await OrderModel.findOneAndUpdate({ _id: delivery.order, status: "paid" }, { status: "processing" });
    } catch (syncError) {
      console.error("Order status sync error (accept):", syncError);
    }

    return res.status(200).json({ message: "Delivery accepted", delivery });
  } catch (error) {
    console.error("Accept delivery error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getDeliveryById = async (req, res) => {
  const { id } = req.params;

  try {
    const delivery = await DeliveryModel.findById(id)
      .populate("order")
      .populate("buyer", "firstName lastName email")
      .populate("vendor", "businessName businessAddress")
      .populate("rider", "firstName lastName phoneNumber");

    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found" });
    }

    const userId = req.user._id.toString();
    const isParty =
      delivery.buyer._id.toString() === userId ||
      delivery.vendor._id.toString() === userId ||
      (delivery.rider && delivery.rider._id.toString() === userId);

    if (!isParty) {
      return res.status(403).json({ message: "You cannot view this delivery" });
    }

    return res.status(200).json({ delivery });
  } catch (error) {
    console.error("Get delivery error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Only the rider assigned to this specific delivery may progress it.
const updateDeliveryStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!RIDER_SETTABLE_STATUSES.includes(status)) {
    return res.status(400).json({
      message: `status must be one of: ${RIDER_SETTABLE_STATUSES.join(", ")}`,
    });
  }

  try {
    const delivery = await DeliveryModel.findById(id);

    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found" });
    }

    if (!delivery.rider || delivery.rider.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not assigned to this delivery" });
    }

    if (["delivered", "confirmed"].includes(delivery.status)) {
      return res.status(400).json({ message: `Delivery is already ${delivery.status}` });
    }

    delivery.status = status;
    if (status === "picked_up") delivery.pickedUpAt = new Date();
    if (status === "delivered") delivery.deliveredAt = new Date();
    await delivery.save();

    try {
      if (status === "picked_up") {
        await OrderModel.findByIdAndUpdate(delivery.order, { status: "shipped" });
      }
    } catch (syncError) {
      console.error("Order status sync error (status):", syncError);
    }

    return res.status(200).json({ message: "Delivery status updated", delivery });
  } catch (error) {
    console.error("Update delivery status error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Buyer confirms receipt, which closes out both the delivery and the order.
const confirmDelivery = async (req, res) => {
  const { id } = req.params;

  try {
    const delivery = await DeliveryModel.findById(id);

    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found" });
    }

    if (delivery.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You cannot confirm this delivery" });
    }

    if (delivery.status !== "delivered") {
      return res.status(400).json({ message: "Delivery has not been marked as delivered yet" });
    }

    delivery.status = "confirmed";
    delivery.confirmedAt = new Date();
    await delivery.save();

    try {
      await OrderModel.findByIdAndUpdate(delivery.order, { status: "completed" });
    } catch (syncError) {
      console.error("Order status sync error (confirm):", syncError);
    }

    // Rider is only paid once the buyer confirms receipt, not merely when
    // marked "delivered" — protects against a rider falsely claiming delivery.
    if (delivery.rider && delivery.fee > 0) {
      try {
        const rider = await RiderModel.findOne({ user: delivery.rider });
        if (rider) {
          await applyWalletEntry({
            riderId: rider._id,
            type: "credit",
            amount: delivery.fee,
            reason: "delivery_earning",
            idempotencyKey: `earning_${delivery._id}`,
            delivery: delivery._id,
          });
        }
      } catch (walletError) {
        console.error("Credit rider wallet error:", walletError);
      }
    }

    return res.status(200).json({ message: "Delivery confirmed", delivery });
  } catch (error) {
    console.error("Confirm delivery error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getDeliveryTracking = async (req, res) => {
  const { id } = req.params;

  try {
    const delivery = await DeliveryModel.findById(id);

    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found" });
    }

    const userId = req.user._id.toString();
    const isParty =
      delivery.buyer.toString() === userId ||
      delivery.vendor.toString() === userId ||
      (delivery.rider && delivery.rider.toString() === userId);

    if (!isParty) {
      return res.status(403).json({ message: "You cannot track this delivery" });
    }

    let riderLocation = null;
    if (delivery.rider) {
      const rider = await RiderModel.findOne({ user: delivery.rider });
      if (rider?.currentLocation?.coordinates?.length === 2) {
        const [lng, lat] = rider.currentLocation.coordinates;
        riderLocation = { lat, lng, updatedAt: rider.locationUpdatedAt };
      }
    }

    return res.status(200).json({
      status: delivery.status,
      riderLocation,
      pickupAddress: delivery.pickupAddress,
      dropoffAddress: delivery.dropoffAddress,
    });
  } catch (error) {
    console.error("Get delivery tracking error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createDeliveryForOrder,
  estimateDelivery,
  acceptDelivery,
  getDeliveryById,
  updateDeliveryStatus,
  confirmDelivery,
  getDeliveryTracking,
};
