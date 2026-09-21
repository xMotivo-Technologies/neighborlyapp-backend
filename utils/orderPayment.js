const OrderModel = require("../models/Order");
const { verifyTransaction } = require("./paystack");
const { createDeliveryForOrder } = require("../controller/delivery/deliveryController");
const { notify, broadcastToRiders, TEMPLATES } = require("../services/notificationService");

/**
 * Shared, idempotent order payment finalizer.
 * Used by both POST /api/verify-payment and the Paystack webhook (charge.success).
 *
 * Atomically transitions orders with status "pending_payment" -> "paid".
 * Only the execution that wins the atomic transition creates the associated Delivery.
 *
 * @param {Object} params
 * @param {string} params.paymentReference - The Paystack transaction reference
 * @param {Object} [params.transactionData] - Optional pre-fetched Paystack transaction object
 * @returns {Promise<{
 *   success: boolean,
 *   alreadyProcessed: boolean,
 *   orders: Array,
 *   wonOrders: Array,
 *   reason?: string
 * }>}
 */
const finalizeOrderPayment = async ({ paymentReference, transactionData }) => {
  if (!paymentReference) {
    return { success: false, alreadyProcessed: false, orders: [], wonOrders: [], reason: "NO_REFERENCE" };
  }

  const orders = await OrderModel.find({ paymentReference });

  if (!orders || orders.length === 0) {
    return { success: false, alreadyProcessed: false, orders: [], wonOrders: [], reason: "NOT_FOUND" };
  }

  // If every order is already paid, return early idempotently
  const allAlreadyPaid = orders.every(
    (order) => order.paymentStatus === "success" && order.status !== "pending_payment"
  );
  if (allAlreadyPaid) {
    return { success: true, alreadyProcessed: true, orders, wonOrders: [] };
  }

  // Obtain transaction details from Paystack if not supplied
  let transaction = transactionData;
  if (!transaction) {
    const paystackResponse = await verifyTransaction(paymentReference);
    transaction = paystackResponse.data;
  }

  if (transaction.status !== "success") {
    await OrderModel.updateMany(
      { paymentReference, status: "pending_payment" },
      { paymentStatus: "failed" }
    );
    return {
      success: false,
      alreadyProcessed: false,
      orders,
      wonOrders: [],
      reason: "TRANSACTION_NOT_SUCCESSFUL",
    };
  }

  const expectedAmountKobo = Math.round(
    orders.reduce((sum, order) => sum + order.totalAmount, 0) * 100
  );

  if (transaction.amount !== expectedAmountKobo) {
    await OrderModel.updateMany(
      { paymentReference, status: "pending_payment" },
      { paymentStatus: "failed" }
    );
    console.error(
      `Payment amount mismatch for reference ${paymentReference}: expected ${expectedAmountKobo}, got ${transaction.amount}`
    );
    return {
      success: false,
      alreadyProcessed: false,
      orders,
      wonOrders: [],
      reason: "AMOUNT_MISMATCH",
    };
  }

  const wonOrders = [];
  const processedOrders = [];

  for (const order of orders) {
    // Atomic state transition: only succeeds if still pending_payment
    const updatedOrder = await OrderModel.findOneAndUpdate(
      { _id: order._id, status: "pending_payment" },
      { paymentStatus: "success", status: "paid", paidAt: new Date() },
      { new: true }
    );

    if (updatedOrder) {
      wonOrders.push(updatedOrder);
      processedOrders.push(updatedOrder);

      // Only the winner creates the Delivery and sends notifications
      try {
        const delivery = await createDeliveryForOrder(updatedOrder);

        // Notify Buyer of confirmed payment
        notify({
          recipientId: updatedOrder.buyer,
          template: TEMPLATES.PAYMENT_CONFIRMED(),
          data: { orderId: updatedOrder._id.toString() },
        });

        // Notify Vendor of new customer order
        notify({
          recipientId: updatedOrder.vendor,
          template: TEMPLATES.NEW_ORDER_VENDOR(),
          data: { orderId: updatedOrder._id.toString() },
        });

        // Broadcast to nearby available riders
        if (delivery?.pickupCoords?.coordinates) {
          broadcastToRiders({
            pickupCoords: delivery.pickupCoords.coordinates,
            template: TEMPLATES.DELIVERY_AVAILABLE_RIDER(),
            data: {
              deliveryId: delivery._id.toString(),
              orderId: updatedOrder._id.toString(),
            },
          });
        }
      } catch (deliveryError) {
        console.error(`Auto-create delivery/notification error for order ${updatedOrder._id}:`, deliveryError);
      }
    } else {
      // Already transitioned by a concurrent process
      const currentOrder = await OrderModel.findById(order._id);
      processedOrders.push(currentOrder || order);
    }
  }

  return {
    success: true,
    alreadyProcessed: wonOrders.length === 0,
    orders: processedOrders,
    wonOrders,
  };
};

module.exports = {
  finalizeOrderPayment,
};
