const RiderModel = require("../models/Rider");
const UserModel = require("../models/User");

/**
 * Resolves a rider identifier (which may be a Rider document _id or a User document _id)
 * to the corresponding User _id.
 *
 * @param {string|mongoose.Types.ObjectId} riderOrUserId
 * @returns {Promise<mongoose.Types.ObjectId|null>} The User _id, or null if not found
 */
const resolveUserIdForRider = async (riderOrUserId) => {
  if (!riderOrUserId) return null;

  try {
    // 1. Check if it's a Rider document ID
    const rider = await RiderModel.findById(riderOrUserId).select("user");
    if (rider?.user) {
      return rider.user;
    }

    // 2. Check if it's already a User document ID who is a rider
    const user = await UserModel.findById(riderOrUserId).select("_id");
    if (user) {
      return user._id;
    }

    return null;
  } catch (error) {
    console.error("Error resolving user ID for rider:", error);
    return null;
  }
};

module.exports = {
  resolveUserIdForRider,
};
