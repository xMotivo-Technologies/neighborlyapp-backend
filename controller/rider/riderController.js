const RiderModel = require("../../models/Rider");
const DeliveryModel = require("../../models/Delivery");
const { DELIVERY_STATUSES } = DeliveryModel;
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { listBanks, resolveAccountNumber } = require("../../utils/paystack");

const VEHICLE_TYPES = ["bicycle", "motorcycle", "car", "van"];
const EARTH_RADIUS_KM = 6378.1;

const applyAsRider = async (req, res) => {
  const { vehicleType, vehiclePlateNumber, licenseNumber } = req.body;

  if (!vehicleType || !VEHICLE_TYPES.includes(vehicleType)) {
    return res.status(400).json({ message: `vehicleType must be one of: ${VEHICLE_TYPES.join(", ")}` });
  }

  try {
    let rider = await RiderModel.findOne({ user: req.user._id });

    if (rider?.status === "pending") {
      return res.status(400).json({ message: "Your rider application is already pending approval" });
    }

    if (rider?.status === "suspended") {
      return res.status(400).json({ message: "Your rider account is suspended, contact support" });
    }

    if (!rider) {
      rider = new RiderModel({ user: req.user._id });
    }

    rider.vehicleType = vehicleType;
    rider.vehiclePlateNumber = vehiclePlateNumber;
    rider.licenseNumber = licenseNumber;
    rider.status = "pending";
    await rider.save();

    return res.status(200).json({
      message: "Rider application submitted and pending admin approval",
      rider,
    });
  } catch (error) {
    console.error("Apply as rider error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getRiderProfile = async (req, res) => {
  try {
    const rider = await RiderModel.findOne({ user: req.user._id });

    if (!rider) {
      return res.status(404).json({ message: "Rider profile not found" });
    }

    return res.status(200).json({ rider });
  } catch (error) {
    console.error("Get rider profile error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /riders/banks — proxies Paystack's bank list so the client can offer a
// bank picker without ever seeing PAYSTACK_SECRET_KEY.
const getBankOptions = async (req, res) => {
  try {
    const { data: banks } = await listBanks();
    return res.status(200).json({ data: banks.map((b) => ({ name: b.name, code: b.code })) });
  } catch (error) {
    console.error("Get bank options error:", error);
    return res.status(502).json({ message: "Unable to fetch bank list" });
  }
};

const updateRiderProfile = async (req, res) => {
  const { vehicleType, vehiclePlateNumber, licenseNumber, accountNumber, bankCode } = req.body;

  if (vehicleType !== undefined && !VEHICLE_TYPES.includes(vehicleType)) {
    return res.status(400).json({ message: `vehicleType must be one of: ${VEHICLE_TYPES.join(", ")}` });
  }

  if ((accountNumber !== undefined) !== (bankCode !== undefined)) {
    return res.status(400).json({ message: "accountNumber and bankCode must be provided together" });
  }

  try {
    const rider = await RiderModel.findOne({ user: req.user._id });

    if (!rider) {
      return res.status(404).json({ message: "Rider profile not found" });
    }

    if (vehicleType !== undefined) rider.vehicleType = vehicleType;
    if (vehiclePlateNumber !== undefined) rider.vehiclePlateNumber = vehiclePlateNumber;
    if (licenseNumber !== undefined) rider.licenseNumber = licenseNumber;

    // Bank details are always re-verified against Paystack here — the account
    // name shown/stored is never taken from the client's own say-so.
    if (accountNumber !== undefined && bankCode !== undefined) {
      const { data: banks } = await listBanks();
      const bank = banks.find((b) => b.code === bankCode);

      if (!bank) {
        return res.status(400).json({ message: "Invalid bankCode" });
      }

      let resolved;
      try {
        resolved = await resolveAccountNumber({ account_number: accountNumber, bank_code: bankCode });
      } catch (resolveError) {
        console.error("Resolve account number error:", resolveError);
        return res.status(400).json({ message: "Could not verify this account number with the selected bank" });
      }

      rider.bankAccountNumber = accountNumber;
      rider.bankCode = bankCode;
      rider.bankName = bank.name;
      rider.bankAccountName = resolved.data.account_name;
      rider.paystackRecipientCode = undefined; // invalidate cache; recreated lazily on next withdrawal
    }

    await rider.save();

    return res.status(200).json({ message: "Rider profile updated", rider });
  } catch (error) {
    console.error("Update rider profile error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// req.rider is populated by the isRider middleware (approved riders only).
const updateAvailability = async (req, res) => {
  const { isAvailable } = req.body;

  if (typeof isAvailable !== "boolean") {
    return res.status(400).json({ message: "isAvailable must be a boolean" });
  }

  try {
    req.rider.isAvailable = isAvailable;
    await req.rider.save();

    return res.status(200).json({ message: "Availability updated", rider: req.rider });
  } catch (error) {
    console.error("Update availability error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const updateLocation = async (req, res) => {
  const { lat, lng } = req.body;
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
    return res.status(400).json({ message: "lat and lng are required" });
  }

  try {
    req.rider.currentLocation = { type: "Point", coordinates: [parsedLng, parsedLat] };
    req.rider.locationUpdatedAt = new Date();
    await req.rider.save();

    return res.status(200).json({
      message: "Location updated",
      location: { lat: parsedLat, lng: parsedLng },
      updatedAt: req.rider.locationUpdatedAt,
    });
  } catch (error) {
    console.error("Update rider location error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Mirrors productController's getNearbyProducts pattern: $near for the
// sorted result, $geoWithin for the count (Mongo rejects $near in counts).
const getAvailableDeliveries = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const radiusKm = parseFloat(req.query.radius) || 15;

    const baseFilter = { status: "pending", rider: null };
    const hasLocation = req.rider.currentLocation?.coordinates?.length === 2;

    let findFilter = baseFilter;
    let countFilter = baseFilter;

    if (hasLocation) {
      const [lng, lat] = req.rider.currentLocation.coordinates;
      findFilter = {
        ...baseFilter,
        pickupCoords: {
          $near: { $geometry: { type: "Point", coordinates: [lng, lat] }, $maxDistance: radiusKm * 1000 },
        },
      };
      countFilter = {
        ...baseFilter,
        pickupCoords: {
          $geoWithin: { $centerSphere: [[lng, lat], radiusKm / EARTH_RADIUS_KM] },
        },
      };
    }

    const [deliveries, total] = await Promise.all([
      DeliveryModel.find(findFilter)
        .populate("order", "items totalAmount")
        .skip(skip)
        .limit(limit),
      DeliveryModel.countDocuments(countFilter),
    ]);

    return res.status(200).json({
      data: deliveries,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get available deliveries error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// A rider's own past deliveries, most recent first. Optional ?status= filters
// to a single delivery status (e.g. "confirmed" for completed-only history).
const getDeliveryHistory = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { status } = req.query;

    if (status !== undefined && !DELIVERY_STATUSES.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${DELIVERY_STATUSES.join(", ")}` });
    }

    const filter = { rider: req.user._id, ...(status !== undefined ? { status } : {}) };

    const [deliveries, total] = await Promise.all([
      DeliveryModel.find(filter)
        .populate("order", "items totalAmount")
        .populate("buyer", "firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      DeliveryModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: deliveries,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get delivery history error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};


module.exports = {
  applyAsRider,
  getRiderProfile,
  updateRiderProfile,
  updateAvailability,
  updateLocation,
  getAvailableDeliveries,
  getDeliveryHistory,
  getBankOptions,
};
