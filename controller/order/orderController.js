const crypto = require("crypto");
const OrderModel = require("../../models/Order");
const ProductModel = require("../../models/Products");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { initializeTransaction, verifyTransaction } = require("../../utils/paystack");
const { haversineDistanceKm, estimateDeliveryFee } = require("../../utils/geo");
const { createDeliveryForOrder } = require("../delivery/deliveryController");
const { getPlatformSettings } = require("../../utils/platformSettings");

const VENDOR_SETTABLE_STATUSES = ["processing", "shipped", "completed", "cancelled"];
const CANCELLABLE_STATUSES = ["pending_payment", "paid", "processing"];

const generatePaymentReference = () => `order_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
const generateOrderGroup = () => `grp_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;

// A cart can hold products from several vendors. Each vendor gets its own
// pickup point, so it also gets its own delivery distance/fee and its own
// Order document — this groups the raw cart items by vendor so the rest of
// createOrder can build one Order per vendor.
const groupItemsByVendor = async (items) => {
  const productIds = items.map((item) => item.productId);
  const products = await ProductModel.find({ _id: { $in: productIds } });
  const productById = new Map(products.map((product) => [product._id.toString(), product]));

  const groupsByVendor = new Map();

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product) {
      throw new OrderValidationError(404, `Product ${item.productId} not found`);
    }

    const parsedQuantity = Number.isInteger(item.quantity) ? item.quantity : parseInt(item.quantity, 10);
    const quantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;

    const vendorId = product.vendor.toString();
    if (!groupsByVendor.has(vendorId)) {
      groupsByVendor.set(vendorId, []);
    }
    groupsByVendor.get(vendorId).push({ product, quantity });
  }

  return groupsByVendor;
};

// Thrown for any per-item validation failure so createOrder can map it
// straight to the right HTTP status instead of always falling back to 500.
class OrderValidationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const createOrder = async (req, res) => {
  const { items, deliveryAddress, lat, lng } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items is required and must be a non-empty array" });
  }

  if (items.some((item) => !item?.productId)) {
    return res.status(400).json({ message: "Every item must include a productId" });
  }

  if (!deliveryAddress) {
    return res.status(400).json({ message: "deliveryAddress is required" });
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
    return res.status(400).json({ message: "lat and lng (delivery destination) are required" });
  }

  try {
    const [groupsByVendor, platformSettings] = await Promise.all([groupItemsByVendor(items), getPlatformSettings()]);
    const productCommissionPercent = platformSettings.productCommissionPercent;

    // Validate every vendor group up front, before creating anything, so a
    // problem with one vendor's items doesn't leave earlier orders orphaned.
    for (const vendorItems of groupsByVendor.values()) {
      for (const { product } of vendorItems) {
        if (product.status !== "active") {
          throw new OrderValidationError(400, `"${product.name}" is not available for purchase`);
        }
        if (product.vendor.toString() === req.user._id.toString()) {
          throw new OrderValidationError(400, `You cannot buy your own product: "${product.name}"`);
        }
        if (!product.locationCoords?.coordinates || product.locationCoords.coordinates.length !== 2) {
          throw new OrderValidationError(
            400,
            `"${product.name}" has no pickup location set and cannot be delivered`,
          );
        }
      }
    }

    const orderGroup = generateOrderGroup();
    const paymentReference = generatePaymentReference();
    const orders = [];

    for (const vendorItems of groupsByVendor.values()) {
      // All of a vendor's products share one pickup point in practice, so the
      // first item's location is used for the whole vendor group's delivery
      // distance/fee.
      const [pickupLng, pickupLat] = vendorItems[0].product.locationCoords.coordinates;
      const deliveryDistanceKm = haversineDistanceKm(
        { lat: pickupLat, lng: pickupLng },
        { lat: parsedLat, lng: parsedLng },
      );
      const deliveryFee = estimateDeliveryFee(deliveryDistanceKm);

      const orderItems = vendorItems.map(({ product, quantity }) => ({
        product: product._id,
        productName: product.name,
        productImage: product.imgUrl?.[0],
        quantity,
        unitPrice: product.price,
        lineTotal: product.price * quantity,
      }));
      const itemsTotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const totalAmount = itemsTotal + deliveryFee;
      const platformCommissionAmount = Math.round(itemsTotal * (productCommissionPercent / 100) * 100) / 100;
      const vendorEarning = itemsTotal - platformCommissionAmount;

      const order = await OrderModel.create({
        orderGroup,
        buyer: req.user._id,
        vendor: vendorItems[0].product.vendor,
        items: orderItems,
        totalAmount,
        deliveryFee,
        deliveryDistanceKm,
        platformCommissionPercent: productCommissionPercent,
        platformCommissionAmount,
        vendorEarning,
        paymentReference,
        deliveryAddress,
        deliveryCoords: { type: "Point", coordinates: [parsedLng, parsedLat] },
      });

      orders.push(order);
    }

    const grandTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);

    let paystackData;
    try {
      const paystackResponse = await initializeTransaction({
        email: req.user.email,
        amount: Math.round(grandTotal * 100),
        reference: paymentReference,
        metadata: {
          orderGroup,
          orderIds: orders.map((order) => order._id.toString()),
          buyerId: req.user._id.toString(),
        },
      });
      paystackData = paystackResponse.data;
    } catch (paystackError) {
      console.error("Paystack initialize error:", paystackError);
      await OrderModel.updateMany({ orderGroup }, { paymentStatus: "failed" });
      return res.status(502).json({ message: "Unable to initialize payment" });
    }

    return res.status(201).json({
      message: "Order created, proceed to payment",
      orderGroup,
      orders,
      payment: {
        authorizationUrl: paystackData.authorization_url,
        accessCode: paystackData.access_code,
        reference: paymentReference,
      },
    });
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Create order error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Confirms payment with Paystack and marks every order in the checkout's
// group paid. One checkout produces one Paystack transaction (and reference)
// covering N orders (one per vendor), so verification and the amount check
// happen once, against the sum of all those orders — never against a single
// order's total.
const verifyPayment = async (req, res) => {
  const { reference } = req.body;

  if (!reference) {
    return res.status(400).json({ message: "reference is required" });
  }

  try {
    const orders = await OrderModel.find({ paymentReference: reference });

    if (orders.length === 0) {
      return res.status(404).json({ message: "Order not found for this reference" });
    }

    if (orders.some((order) => order.buyer.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: "This order does not belong to you" });
    }

    if (orders.every((order) => order.paymentStatus === "success")) {
      return res.status(200).json({ message: "Payment already verified", orders });
    }

    const { data: transaction } = await verifyTransaction(reference);

    if (transaction.status !== "success") {
      await OrderModel.updateMany({ paymentReference: reference }, { paymentStatus: "failed" });
      return res.status(400).json({ message: "Payment was not successful" });
    }

    const expectedAmountKobo = Math.round(orders.reduce((sum, order) => sum + order.totalAmount, 0) * 100);
    if (transaction.amount !== expectedAmountKobo) {
      await OrderModel.updateMany({ paymentReference: reference }, { paymentStatus: "failed" });
      console.error(
        `Payment amount mismatch for reference ${reference}: expected ${expectedAmountKobo}, got ${transaction.amount}`,
      );
      return res.status(400).json({ message: "Payment amount mismatch" });
    }

    for (const order of orders) {
      order.paymentStatus = "success";
      order.status = "paid";
      order.paidAt = new Date();
      await order.save();

      // Every order includes delivery — spin it up now, per vendor. A
      // failure here must not undo a payment that already succeeded; it's
      // logged for manual follow-up instead.
      try {
        await createDeliveryForOrder(order);
      } catch (deliveryError) {
        console.error("Auto-create delivery error:", deliveryError);
      }
    }

    return res.status(200).json({ message: "Payment verified successfully", orders });
  } catch (error) {
    console.error("Verify payment error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Fetches every sibling order from one checkout (buyer-owned only) — used to
// render an order-confirmation screen right after payment, since one
// checkout now yields one order per vendor instead of a single order.
const getOrderGroup = async (req, res) => {
  const { orderGroup } = req.params;

  try {
    const orders = await OrderModel.find({ orderGroup, buyer: req.user._id })
      .populate("items.product", "name price imgUrl")
      .populate("vendor", "businessName businessAddress")
      .sort({ createdAt: 1 });

    if (orders.length === 0) {
      return res.status(404).json({ message: "Order group not found" });
    }

    return res.status(200).json({ orderGroup, orders });
  } catch (error) {
    console.error("Get order group error:", error);
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
        .populate("items.product", "name price imgUrl")
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
        .populate("items.product", "name price imgUrl")
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
      .populate("items.product", "name price imgUrl")
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
  getOrderGroup,
  getMyOrders,
  getVendorOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
};
