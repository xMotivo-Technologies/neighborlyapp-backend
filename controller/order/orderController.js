const crypto = require("crypto");
const OrderModel = require("../../models/Order");
const ProductModel = require("../../models/Products");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { initializeTransaction, verifyTransaction } = require("../../utils/paystack");
const { haversineDistanceKm, estimateDeliveryFee } = require("../../utils/geo");
const { createDeliveryForOrder } = require("../delivery/deliveryController");

const VENDOR_SETTABLE_STATUSES = ["processing", "shipped", "completed", "cancelled"];
const CANCELLABLE_STATUSES = ["pending_payment", "paid", "processing"];

const generatePaymentReference = () => `order_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;

// Buyer starts a purchase. Price, vendor and product details are always
// re-derived from the DB here — the client only ever supplies productId/quantity.
// Delivery is mandatory: the buyer's destination is required, the fee is
// computed from the seller's product location to that destination, and it's
// charged as part of the same Paystack transaction as the product price.
const createOrder = async (req, res) => {
  const { productId, quantity, deliveryAddress, lat, lng } = req.body;

  if (!productId) {
    return res.status(400).json({ message: "productId is required" });
  }

  if (!deliveryAddress) {
    return res.status(400).json({ message: "deliveryAddress is required" });
  }

  const parsedQuantity = Number.isInteger(quantity) ? quantity : parseInt(quantity, 10);
  const finalQuantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
    return res.status(400).json({ message: "lat and lng (delivery destination) are required" });
  }

  try {
    const product = await ProductModel.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.status !== "active") {
      return res.status(400).json({ message: "Product is not available for purchase" });
    }

    if (product.vendor.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot buy your own product" });
    }

    if (!product.locationCoords?.coordinates || product.locationCoords.coordinates.length !== 2) {
      return res.status(400).json({ message: "This product has no pickup location set and cannot be delivered" });
    }

    const [pickupLng, pickupLat] = product.locationCoords.coordinates;
    const deliveryDistanceKm = haversineDistanceKm(
      { lat: pickupLat, lng: pickupLng },
      { lat: parsedLat, lng: parsedLng },
    );
    const deliveryFee = estimateDeliveryFee(deliveryDistanceKm);

    const unitPrice = product.price;
    const totalAmount = unitPrice * finalQuantity + deliveryFee;
    const paymentReference = generatePaymentReference();

    const order = await OrderModel.create({
      buyer: req.user._id,
      vendor: product.vendor,
      product: product._id,
      productName: product.name,
      productImage: product.imgUrl?.[0],
      quantity: finalQuantity,
      unitPrice,
      totalAmount,
      deliveryFee,
      deliveryDistanceKm,
      paymentReference,
      deliveryAddress,
      deliveryCoords: { type: "Point", coordinates: [parsedLng, parsedLat] },
    });

    let paystackData;
    try {
      const paystackResponse = await initializeTransaction({
        email: req.user.email,
        amount: Math.round(totalAmount * 100),
        reference: paymentReference,
        metadata: {
          orderId: order._id.toString(),
          productId: product._id.toString(),
          buyerId: req.user._id.toString(),
        },
      });
      paystackData = paystackResponse.data;
    } catch (paystackError) {
      console.error("Paystack initialize error:", paystackError);
      order.paymentStatus = "failed";
      await order.save();
      return res.status(502).json({ message: "Unable to initialize payment" });
    }

    return res.status(201).json({
      message: "Order created, proceed to payment",
      order,
      payment: {
        authorizationUrl: paystackData.authorization_url,
        accessCode: paystackData.access_code,
        reference: paymentReference,
      },
    });
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Confirms payment with Paystack and marks the order paid. The client only
// ever supplies productId/reference/quantity — the amount is verified
// against what this order was actually initialized for, never client input.
const verifyPayment = async (req, res) => {
  const { productId, reference, quantity } = req.body;

  if (!productId || !reference) {
    return res.status(400).json({ message: "productId and reference are required" });
  }

  const parsedQuantity = Number.isInteger(quantity) ? quantity : parseInt(quantity, 10);
  const finalQuantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;

  try {
    const order = await OrderModel.findOne({ paymentReference: reference });

    if (!order) {
      return res.status(404).json({ message: "Order not found for this reference" });
    }

    if (order.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "This order does not belong to you" });
    }

    if (order.product.toString() !== productId) {
      return res.status(400).json({ message: "productId does not match this payment reference" });
    }

    if (order.quantity !== finalQuantity) {
      return res.status(400).json({ message: "quantity does not match this payment reference" });
    }

    if (order.paymentStatus === "success") {
      return res.status(200).json({ message: "Payment already verified", order });
    }

    const { data: transaction } = await verifyTransaction(reference);

    if (transaction.status !== "success") {
      order.paymentStatus = "failed";
      await order.save();
      return res.status(400).json({ message: "Payment was not successful" });
    }

    const expectedAmountKobo = Math.round(order.totalAmount * 100);
    if (transaction.amount !== expectedAmountKobo) {
      order.paymentStatus = "failed";
      await order.save();
      console.error(
        `Payment amount mismatch for order ${order._id}: expected ${expectedAmountKobo}, got ${transaction.amount}`,
      );
      return res.status(400).json({ message: "Payment amount mismatch" });
    }

    order.paymentStatus = "success";
    order.status = "paid";
    order.paidAt = new Date();
    await order.save();

    // Every order includes delivery — spin it up now. A failure here must
    // not undo a payment that already succeeded; it's logged for manual
    // follow-up instead.
    try {
      await createDeliveryForOrder(order);
    } catch (deliveryError) {
      console.error("Auto-create delivery error:", deliveryError);
    }

    return res.status(200).json({ message: "Payment verified successfully", order });
  } catch (error) {
    console.error("Verify payment error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getMyOrders = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { buyer: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      OrderModel.find(filter)
        .populate("product", "name price imgUrl")
        .populate("vendor", "businessName businessAddress")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      OrderModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: orders,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get my orders error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getVendorOrders = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { vendor: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      OrderModel.find(filter)
        .populate("product", "name price imgUrl")
        .populate("buyer", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      OrderModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: orders,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get vendor orders error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getOrderById = async (req, res) => {
  const { id } = req.params;

  try {
    const order = await OrderModel.findById(id)
      .populate("product", "name price imgUrl")
      .populate("buyer", "firstName lastName email")
      .populate("vendor", "businessName businessAddress");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const isBuyer = order.buyer._id.toString() === req.user._id.toString();
    const isVendorOwner = order.vendor._id.toString() === req.user._id.toString();

    if (!isBuyer && !isVendorOwner) {
      return res.status(403).json({ message: "You cannot view this order" });
    }

    return res.status(200).json({ order });
  } catch (error) {
    console.error("Get order error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Vendor progresses an order they own through fulfillment (or cancels it).
const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!VENDOR_SETTABLE_STATUSES.includes(status)) {
    return res.status(400).json({
      message: `status must be one of: ${VENDOR_SETTABLE_STATUSES.join(", ")}`,
    });
  }

  try {
    const order = await OrderModel.findById(id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You cannot update this order" });
    }

    if (["completed", "cancelled"].includes(order.status)) {
      return res.status(400).json({ message: `Order is already ${order.status}` });
    }

    if (order.status === "pending_payment") {
      return res.status(400).json({ message: "Order has not been paid for yet" });
    }

    order.status = status;
    if (status === "cancelled") order.cancelledAt = new Date();
    await order.save();

    return res.status(200).json({ message: "Order status updated", order });
  } catch (error) {
    console.error("Update order status error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Buyer cancels their own order, only while it is still cancellable.
const cancelOrder = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const order = await OrderModel.findById(id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You cannot cancel this order" });
    }

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      return res.status(400).json({ message: `Order can no longer be cancelled (status: ${order.status})` });
    }

    order.status = "cancelled";
    order.cancelledAt = new Date();
    if (reason) order.cancelReason = reason;
    await order.save();

    return res.status(200).json({ message: "Order cancelled", order });
  } catch (error) {
    console.error("Cancel order error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getMyOrders,
  getVendorOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
};
