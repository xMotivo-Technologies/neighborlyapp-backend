const { Resend } = require("resend");

// Shared client for the newer transactional mail templates (vendor/rider
// application outcomes, orders, withdrawals, account actions) — avoids
// re-instantiating a Resend client in every template file.
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = resend;
