const RiderModel = require("../../models/Rider");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { notify, TEMPLATES } = require("../../services/notificationService");

const listRiders = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [riders, total] = await Promise.all([
      RiderModel.find(filter)
        .populate("user", "firstName lastName email phoneNumber")
        .skip(skip)
        .limit(limit),
      RiderModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: riders,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("List riders error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getRiderById = async (req, res) => {
  const { id } = req.params;

  try {
    const rider = await RiderModel.findById(id).populate("user", "firstName lastName email phoneNumber");

    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }

    return res.status(200).json({ rider });
  } catch (error) {
    console.error("Get rider error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const approveRider = async (req, res) => {
  const { id } = req.params;

  try {
    const rider = await RiderModel.findById(id);

    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }

    rider.status = "approved";
    rider.suspendedAt = undefined;
    rider.suspendReason = undefined;
    await rider.save();

    notify({
      recipientId: rider.user,
      template: TEMPLATES.RIDER_APPLICATION_APPROVED(),
      data: { riderId: rider._id.toString(), audience: "rider" },
    });

    return res.status(200).json({ message: "Rider approved", rider });
  } catch (error) {
    console.error("Approve rider error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const suspendRider = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const rider = await RiderModel.findById(id);

    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }

    rider.status = "suspended";
    rider.isAvailable = false;
    rider.suspendedAt = new Date();
    if (reason) rider.suspendReason = reason;
    await rider.save();

    notify({
      recipientId: rider.user,
      template: TEMPLATES.RIDER_APPLICATION_SUSPENDED(),
      data: { riderId: rider._id.toString(), reason, audience: "rider" },
    });

    return res.status(200).json({ message: "Rider suspended", rider });
  } catch (error) {
    console.error("Suspend rider error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  listRiders,
  getRiderById,
  approveRider,
  suspendRider,
};
