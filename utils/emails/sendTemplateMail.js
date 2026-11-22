const UserModel = require("../../models/User");

// Fire-and-forget email sender used alongside notify() push calls. Looks up
// the recipient's email/firstName itself (mirrors notify()'s own internal
// lookup) so call sites don't need to fetch a user doc just to email it.
// Never throws — a mail failure must never break the action that triggered
// it (approving a vendor, paying out a withdrawal, etc).
const sendTemplateMail = async ({ recipientId, mailFn, ...extra }) => {
  try {
    if (!recipientId) return;

    const user = await UserModel.findById(recipientId).select("email firstName isDeleted");
    if (!user || user.isDeleted || !user.email) return;

    await mailFn({ email: user.email, firstName: user.firstName, ...extra });
  } catch (error) {
    console.error("sendTemplateMail error:", error);
  }
};

module.exports = { sendTemplateMail };
