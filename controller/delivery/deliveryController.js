const mongoose = require("mongoose");
const DeliveryModel = require("../../models/Delivery");
const OrderModel = require("../../models/Order");
const ProductModel = require("../../models/Products");
const RiderModel = require("../../models/Rider");
const { haversineDistanceKm, estimateDeliveryFee, estimateDurationMinutes } = require("../../utils/geo");
const { applyWalletEntry } = require("../../utils/walletLedger");
const { applyVendorWalletEntry } = require("../../utils/vendorWalletLedger");
const { getPlatformSettings } = require("../../utils/platformSettings");
const { notify, TEMPLATES } = require("../../services/notificationService");

const RIDER_SETTABLE_STATUSES = ["picked_up", "in_transit", "delivered"];
// A buyer who never taps confirm would otherwise block the rider/vendor from
// ever getting paid — autoConfirmStaleDeliveries sweeps past this deadline.
const AUTO_CONFIRM_AFTER_DAYS = 3;

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

  const { deliveryCommissionPercent } = await getPlatformSettings();
  const platformDeliveryCommission = Math.round(order.deliveryFee * (deliveryCommissionPercent / 100) * 100) / 100;
  const riderEarning = order.deliveryFee - platformDeliveryCommission;

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
    platformCommissionPercent: deliveryCommissionPercent,
    platformDeliveryCommission,
    riderEarning,
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

    // Notify Rider
    notify({
      recipientId: req.user._id,
      template: TEMPLATES.RIDER_DELIVERY_ACCEPTED(),
      data: { deliveryId: delivery._id.toString(), orderId: delivery.order.toString(), audience: "rider" },
    });

    // Notify Buyer
    const riderName = req.user.firstName ? `${req.user.firstName} ${req.user.lastName || ""}`.trim() : "A rider";
    notify({
      recipientId: delivery.buyer,
      template: TEMPLATES.DELIVERY_ACCEPTED(riderName),
      data: { deliveryId: delivery._id.toString(), orderId: delivery.order.toString(), audience: "buyer" },
    });

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

    // If caller is the rider, strip product prices so riders do not see product prices
    let deliveryObj = delivery.toObject();
    if (delivery.rider && delivery.rider._id.toString() === userId) {
      if (deliveryObj.order) {
        delete deliveryObj.order.totalAmount;
        delete deliveryObj.order.subtotal;
        delete deliveryObj.order.productPrice;
        if (Array.isArray(deliveryObj.order.items)) {
          deliveryObj.order.items = deliveryObj.order.items.map((item) => {
            const { unitPrice, price, lineTotal, totalAmount, ...rest } = item;
            return rest;
          });
        }
      }
    }

    return res.status(200).json({ delivery: deliveryObj });
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

    // Trigger delivery status notifications
    if (status === "picked_up") {
      notify({
        recipientId: delivery.buyer,
        template: TEMPLATES.DELIVERY_PICKED_UP(),
        data: { deliveryId: delivery._id.toString(), orderId: delivery.order.toString(), audience: "buyer" },
      });
      notify({
        recipientId: delivery.vendor,
        template: TEMPLATES.VENDOR_DELIVERY_PICKED_UP(),
        data: { deliveryId: delivery._id.toString(), orderId: delivery.order.toString(), audience: "vendor" },
      });
    } else if (status === "in_transit") {
      notify({
        recipientId: delivery.buyer,
        template: TEMPLATES.DELIVERY_IN_TRANSIT(),
        data: { deliveryId: delivery._id.toString(), orderId: delivery.order.toString(), audience: "buyer" },
      });
    } else if (status === "delivered") {
      notify({
        recipientId: delivery.buyer,
        template: TEMPLATES.DELIVERY_DELIVERED(),
        data: { deliveryId: delivery._id.toString(), orderId: delivery.order.toString(), audience: "buyer" },
      });
    }

    return res.status(200).json({ message: "Delivery status updated", delivery });
  } catch (error) {
    console.error("Update delivery status error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Credits a rider's wallet for one delivery. Safe to call more than once
// (applyWalletEntry is idempotent on idempotencyKey) — used both right after
// confirmation and by retryFailedDeliveryPayouts to recover from a prior
// failure. Persists/clears delivery.riderPayoutError so a failed credit is
// visible and can be swept up for retry instead of only living in logs.
const creditRiderForDelivery = async (delivery) => {
  const riderEarning = delivery.riderEarning ?? delivery.fee;
  if (!delivery.rider || !(riderEarning > 0)) return;

  try {
    const rider = await RiderModel.findOne({ user: delivery.rider });
    if (!rider) return;

    await applyWalletEntry({
      riderId: rider._id,
      type: "credit",
      amount: riderEarning,
      reason: "delivery_earning",
      idempotencyKey: `earning_${delivery._id}`,
      delivery: delivery._id,
    });

    if (delivery.riderPayoutError) {
      delivery.riderPayoutError = undefined;
      await delivery.save();
    }

    notify({
      recipientId: delivery.rider,
      template: TEMPLATES.RIDER_WALLET_CREDIT(),
      data: { deliveryId: delivery._id.toString(), orderId: delivery.order.toString() },
    });
  } catch (walletError) {
    console.error("Credit rider wallet error:", walletError);
    delivery.riderPayoutError = walletError.message;
    await delivery.save().catch((saveError) => {
      console.error("Persist riderPayoutError failed:", saveError);
    });
  }
};

// Mirrors creditRiderForDelivery for the vendor side of the same order.
const creditVendorForOrder = async (order) => {
  if (!order || !(order.vendorEarning > 0)) return;

  try {
    await applyVendorWalletEntry({
      vendorId: order.vendor,
      type: "credit",
      amount: order.vendorEarning,
      reason: "order_earning",
      idempotencyKey: `vendor_earning_${order._id}`,
      order: order._id,
    });

    if (order.vendorPayoutError) {
      await OrderModel.findByIdAndUpdate(order._id, { $unset: { vendorPayoutError: 1 } });
    }

    notify({
      recipientId: order.vendor,
      template: TEMPLATES.VENDOR_WALLET_CREDIT(),
      data: { orderId: order._id.toString() },
    });
  } catch (walletError) {
    console.error("Credit vendor wallet error:", walletError);
    await OrderModel.findByIdAndUpdate(order._id, { vendorPayoutError: walletError.message }).catch((saveError) => {
      console.error("Persist vendorPayoutError failed:", saveError);
    });
  }
};

// Shared by confirmDelivery (buyer-triggered) and autoConfirmStaleDeliveries
// (cron fallback) — marks the order completed and pays out rider + vendor.
const settleConfirmedDelivery = async (delivery) => {
  const order = await OrderModel.findByIdAndUpdate(delivery.order, { status: "completed" }, { new: true }).catch(
    (syncError) => {
      console.error("Order status sync error (settle):", syncError);
      return null;
    },
  );

  await creditRiderForDelivery(delivery);
  await creditVendorForOrder(order);

  return order;
};

// Buyer confirms receipt, which closes out both the delivery and the order.
const confirmDelivery = async (req, res) => {
  const { id } = req.params;

  try {
    let delivery = null;
    if (mongoose.isValidObjectId(id)) {
      delivery = await DeliveryModel.findOne({
        $or: [{ _id: id }, { order: id }],
      });
    }

    if (!delivery) {
      // Check if it's an order directly
      if (mongoose.isValidObjectId(id)) {
        const order = await OrderModel.findById(id);
        if (order) {
          if (order.buyer.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "You cannot confirm this order" });
          }
          if (order.status === "completed") {
            return res.status(200).json({ message: "Order is already completed", order });
          }
          order.status = "completed";
          await order.save();

          if (order.vendorEarning > 0) {
            try {
              await applyVendorWalletEntry({
                vendorId: order.vendor,
                type: "credit",
                amount: order.vendorEarning,
                reason: "order_earning",
                idempotencyKey: `vendor_earning_${order._id}`,
                order: order._id,
              });
              notify({
                recipientId: order.vendor,
                template: TEMPLATES.VENDOR_WALLET_CREDIT(),
                data: { orderId: order._id.toString(), audience: "vendor" },
              });
            } catch (walletError) {
              console.error("Credit vendor wallet error:", walletError);
            }
          }
          return res.status(200).json({ message: "Delivery confirmed and order completed", order });
        }
      }
      return res.status(404).json({ message: "Delivery not found" });
    }

    if (delivery.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You cannot confirm this delivery" });
    }

    if (!["delivered", "in_transit", "picked_up", "shipped"].includes(delivery.status)) {
      return res.status(400).json({ message: "Delivery has not been dispatched yet" });
    }

    delivery.status = "confirmed";
    delivery.confirmedAt = new Date();
    await delivery.save();

    // Rider and vendor are only paid once the buyer confirms receipt, not
    // merely when marked "delivered" — protects against a false claim of
    // delivery and against paying out on an order that turns out disputed.
    const riderEarning = delivery.riderEarning ?? delivery.fee;
    if (delivery.rider && riderEarning > 0) {
      try {
        const rider = await RiderModel.findOne({ user: delivery.rider });
        if (rider) {
          await applyWalletEntry({
            riderId: rider._id,
            type: "credit",
            amount: riderEarning,
            reason: "delivery_earning",
            idempotencyKey: `earning_${delivery._id}`,
            delivery: delivery._id,
          });

          // Notify Rider of wallet credit
          notify({
            recipientId: delivery.rider,
            template: TEMPLATES.RIDER_WALLET_CREDIT(),
            data: { deliveryId: delivery._id.toString(), orderId: delivery.order.toString() },
          });
        }
      } catch (walletError) {
        console.error("Credit rider wallet error:", walletError);
      }
    }

    if (order?.vendorEarning > 0) {
      try {
        await applyVendorWalletEntry({
          vendorId: order.vendor,
          type: "credit",
          amount: order.vendorEarning,
          reason: "order_earning",
          idempotencyKey: `vendor_earning_${order._id}`,
          order: order._id,
        });

        // Notify Vendor of wallet credit
        notify({
          recipientId: order.vendor,
          template: TEMPLATES.VENDOR_WALLET_CREDIT(),
          data: { orderId: order._id.toString() },
        });
      } catch (walletError) {
        console.error("Credit vendor wallet error:", walletError);
      }
    }

    // Notify Buyer of confirmed receipt
    notify({
      recipientId: delivery.buyer,
      template: TEMPLATES.DELIVERY_CONFIRMED_BUYER(),
      data: { deliveryId: delivery._id.toString(), orderId: delivery.order.toString(), audience: "buyer" },
    });

    return res.status(200).json({ message: "Delivery confirmed", delivery });
  } catch (error) {
    console.error("Confirm delivery error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Cron fallback (see index.js) for buyers who never tap confirm. Anything
// still "delivered" after AUTO_CONFIRM_AFTER_DAYS is confirmed on their
// behalf so the rider/vendor aren't stuck waiting on a silent buyer forever.
const autoConfirmStaleDeliveries = async () => {
  const cutoff = new Date(Date.now() - AUTO_CONFIRM_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const staleDeliveries = await DeliveryModel.find({ status: "delivered", deliveredAt: { $lte: cutoff } });

  for (const delivery of staleDeliveries) {
    try {
      delivery.status = "confirmed";
      delivery.confirmedAt = new Date();
      delivery.autoConfirmed = true;
      await delivery.save();

      await settleConfirmedDelivery(delivery);

      notify({
        recipientId: delivery.buyer,
        template: TEMPLATES.DELIVERY_AUTO_CONFIRMED_BUYER(),
        data: { deliveryId: delivery._id.toString(), orderId: delivery.order.toString() },
      });
    } catch (error) {
      console.error(`Auto-confirm delivery ${delivery._id} error:`, error);
    }
  }

  return staleDeliveries.length;
};

// Cron fallback (see index.js) for the rarer case where confirmation
// succeeded but crediting the rider/vendor wallet threw at the time — e.g. a
// transient DB blip. Both wallet entries are idempotent on their
// idempotencyKey, so retrying a payout that actually already landed is safe.
const retryFailedDeliveryPayouts = async () => {
  const [deliveriesToRetry, ordersToRetry] = await Promise.all([
    DeliveryModel.find({ riderPayoutError: { $exists: true } }),
    OrderModel.find({ vendorPayoutError: { $exists: true } }),
  ]);

  for (const delivery of deliveriesToRetry) {
    await creditRiderForDelivery(delivery);
  }

  for (const order of ordersToRetry) {
    await creditVendorForOrder(order);
  }

  return { riderRetries: deliveriesToRetry.length, vendorRetries: ordersToRetry.length };
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
  autoConfirmStaleDeliveries,
  retryFailedDeliveryPayouts,
};
