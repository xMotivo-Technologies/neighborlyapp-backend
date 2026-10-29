const PAYSTACK_BASE_URL = "https://api.paystack.co";

const paystackRequest = async (path, options = {}) => {
  const response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok || data.status === false) {
    const error = new Error(data.message || "Paystack request failed");
    error.paystackResponse = data;
    throw error;
  }

  return data;
};

// amount must be in kobo (smallest currency unit)
const initializeTransaction = ({ email, amount, reference, metadata, callback_url }) => {
  return paystackRequest("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({ email, amount, reference, metadata, callback_url }),
  });
};

const verifyTransaction = (reference) => {
  return paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
  });
};

const listBanks = () => {
  return paystackRequest("/bank?country=nigeria&currency=NGN", { method: "GET" });
};

const resolveAccountNumber = ({ account_number, bank_code }) => {
  const query = new URLSearchParams({ account_number, bank_code }).toString();
  return paystackRequest(`/bank/resolve?${query}`, { method: "GET" });
};

// Recipients are reusable across transfers to the same bank account.
const createTransferRecipient = ({ name, account_number, bank_code }) => {
  return paystackRequest("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({ type: "nuban", currency: "NGN", name, account_number, bank_code }),
  });
};

// amount must be in kobo. reference is the caller's own idempotency key —
// reusing it on retry lets Paystack de-dupe instead of double-paying.
const initiateTransfer = ({ source = "balance", amount, recipient, reason, reference }) => {
  return paystackRequest("/transfer", {
    method: "POST",
    body: JSON.stringify({ source, amount, recipient, reason, reference }),
  });
};

const verifyTransferByReference = (reference) => {
  return paystackRequest(`/transfer/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
  });
};

// amount is optional and in kobo — omit it for a full refund of the original
// charge, or pass a sub-amount to refund only part of it (used when one
// charge paid for several per-vendor orders and only one is cancelled).
const createRefund = ({ transaction, amount, merchant_note }) => {
  return paystackRequest("/refund", {
    method: "POST",
    body: JSON.stringify({ transaction, amount, merchant_note }),
  });
};

module.exports = {
  initializeTransaction,
  verifyTransaction,
  listBanks,
  resolveAccountNumber,
  createTransferRecipient,
  initiateTransfer,
  verifyTransferByReference,
  createRefund,
};
