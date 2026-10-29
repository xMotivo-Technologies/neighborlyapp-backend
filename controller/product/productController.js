const ProductModel = require("../../models/Products");
const FavoriteModel = require("../../models/Favorite");
const ProductViewModel = require("../../models/ProductView");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { uploadImageBuffer } = require("../../utils/cloudinary");
const { cancelActiveAdvertsForProduct } = require("../../utils/advertLifecycle");

const EARTH_RADIUS_KM = 6378.1;
const PRODUCT_STATUSES = ["active", "sold", "inactive"];

// Normalizes image input to a single imgUrl: [cloudinary-url, ...] shape,
// whether images arrived as uploaded files (multer) or as an already-hosted
// array of URLs in the body.
const resolveImages = async (req) => {
  if (req.files && req.files.length > 0) {
    return Promise.all(req.files.map((file) => uploadImageBuffer(file.buffer)));
  }

  if (Array.isArray(req.body.imgUrl)) {
    return req.body.imgUrl;
  }

  return undefined;
};

const parseCoords = (query) => {
  const lat = parseFloat(query.lat);
  const lng = parseFloat(query.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
};

const buildSort = (sortParam, hasText) => {
  switch (sortParam) {
    case "price_asc":
      return { price: 1 };
    case "price_desc":
      return { price: -1 };
    case "oldest":
      return { createdAt: 1 };
    case "newest":
      return { createdAt: -1 };
    default:
      return hasText ? { score: { $meta: "textScore" } } : { createdAt: -1 };
  }
};

const createProduct = async (req, res) => {
  const { name, desc, price, category, location, condition, lat, lng } = req.body;

  try {
    const imgUrl = await resolveImages(req);

    if (!name || !desc || !imgUrl || imgUrl.length === 0 || price === undefined || !location) {
      return res.status(400).json({
        message: "name, desc, imgUrl (or uploaded images), price and location are required",
      });
    }

    const productData = {
      name,
      desc,
      imgUrl,
      price,
      category,
      location,
      condition,
      vendor: req.user._id,
    };

    const coords = parseCoords({ lat, lng });
    if (coords) {
      productData.locationCoords = { type: "Point", coordinates: [coords.lng, coords.lat] };
    }

    const product = await ProductModel.create(productData);

    return res.status(201).json({
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    console.error("Create product error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const editProduct = async (req, res) => {
  const { id } = req.params;
  const { name, desc, price, category, location, condition, lat, lng } = req.body;
  console.log("body:", req.body);

  try {
    const product = await ProductModel.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You cannot edit this product" });
    }

    const imgUrl = await resolveImages(req);

    // Changing what a listing actually shows is exactly what moderation
    // reviewed in the first place — an approved product that gets its name,
    // description, or images edited goes back to pending so it's re-reviewed
    // rather than silently keeping its old approval on new content.
    const contentChanged =
      (imgUrl !== undefined && JSON.stringify(imgUrl) !== JSON.stringify(product.imgUrl)) ||
      (name !== undefined && name !== product.name) ||
      (desc !== undefined && desc !== product.desc);

    if (imgUrl !== undefined) product.imgUrl = imgUrl;
    if (name !== undefined) product.name = name;
    if (desc !== undefined) product.desc = desc;
    if (price !== undefined) product.price = price;
    if (category !== undefined) product.category = category;
    if (location !== undefined) product.location = location;
    if (condition !== undefined) product.condition = condition;

    const coords = parseCoords({ lat, lng });
    if (coords) {
      product.locationCoords = { type: "Point", coordinates: [coords.lng, coords.lat] };
    }

    const movedToPending = contentChanged && product.moderationStatus === "approved";
    if (movedToPending) {
      product.moderationStatus = "pending";
    }

    await product.save();

    if (movedToPending) {
      await cancelActiveAdvertsForProduct(product._id);
    }

    return res.status(200).json({
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Edit product error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const updateProductStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!PRODUCT_STATUSES.includes(status)) {
    return res.status(400).json({
      message: `status must be one of: ${PRODUCT_STATUSES.join(", ")}`,
    });
  }

  try {
    const product = await ProductModel.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You cannot update this product" });
    }

    product.status = status;
    await product.save();

    if (status !== "active") {
      await cancelActiveAdvertsForProduct(product._id);
    }

    return res.status(200).json({
      message: "Product status updated",
      product,
    });
  } catch (error) {
    console.error("Update product status error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { status: "active", moderationStatus: "approved" };

    const [products, total] = await Promise.all([
      ProductModel.find(filter)
        .populate("vendor", "businessName businessAddress")
        .skip(skip)
        .limit(limit),
      ProductModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: products,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get all products error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getMyProducts = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { vendor: req.user._id };

    const [products, total] = await Promise.all([
      ProductModel.find(filter)
        .populate("vendor", "businessName businessAddress")
        .skip(skip)
        .limit(limit),
      ProductModel.countDocuments(filter),
    ]);
    return res.status(200).json({
      data: products,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get my products error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}; 

const getProductsByCategory = async (req, res) => {
  const { categoryName } = req.params;

  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { category: categoryName, status: "active", moderationStatus: "approved" };

    const [products, total] = await Promise.all([
      ProductModel.find(filter)
        .populate("vendor", "businessName businessAddress")
        .skip(skip)
        .limit(limit),
      ProductModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: products,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get products by category error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Sorted nearest-first via $near, which requires the 2dsphere index on locationCoords.
const getNearbyProducts = async (req, res) => {
  const coords = parseCoords(req.query);

  if (!coords) {
    return res.status(400).json({ message: "lat and lng are required" });
  }

  const radiusKm = parseFloat(req.query.radius) || 10;

  try {
    const { page, limit, skip } = getPagination(req.query);
    const baseFilter = { status: "active", moderationStatus: "approved" };

    // $near sorts by distance but MongoDB rejects it inside countDocuments()
    // (which runs as an aggregation $match), so counting uses an equivalent
    // $geoWithin filter over the same circle instead.
    const nearFilter = {
      ...baseFilter,
      locationCoords: {
        $near: {
          $geometry: { type: "Point", coordinates: [coords.lng, coords.lat] },
          $maxDistance: radiusKm * 1000,
        },
      },
    };
    const countFilter = {
      ...baseFilter,
      locationCoords: {
        $geoWithin: {
          $centerSphere: [[coords.lng, coords.lat], radiusKm / EARTH_RADIUS_KM],
        },
      },
    };

    const [products, total] = await Promise.all([
      ProductModel.find(nearFilter)
        .populate("vendor", "businessName businessAddress")
        .skip(skip)
        .limit(limit),
      ProductModel.countDocuments(countFilter),
    ]);

    return res.status(200).json({
      data: products,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get nearby products error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// $geoWithin (not $near) is used here so a geo filter can be combined with
// $text search and an arbitrary `sort` — $near forces its own distance sort.
const searchProducts = async (req, res) => {
  try {
    const { q, category, condition, priceMin, priceMax, sort } = req.query;
    const { page, limit, skip } = getPagination(req.query);

    const filter = { status: "active", moderationStatus: "approved" };
    let projection = null;

    if (q) {
      filter.$text = { $search: q };
      projection = { score: { $meta: "textScore" } };
    }

    if (category) filter.category = category;
    if (condition) filter.condition = condition;

    const min = parseFloat(priceMin);
    const max = parseFloat(priceMax);
    if (!Number.isNaN(min) || !Number.isNaN(max)) {
      filter.price = {};
      if (!Number.isNaN(min)) filter.price.$gte = min;
      if (!Number.isNaN(max)) filter.price.$lte = max;
    }

    const coords = parseCoords(req.query);
    if (coords) {
      const radiusKm = parseFloat(req.query.radius) || 10;
      filter.locationCoords = {
        $geoWithin: {
          $centerSphere: [[coords.lng, coords.lat], radiusKm / EARTH_RADIUS_KM],
        },
      };
    }

    const [products, total] = await Promise.all([
      ProductModel.find(filter, projection)
        .populate("vendor", "businessName businessAddress")
        .sort(buildSort(sort, Boolean(q)))
        .skip(skip)
        .limit(limit),
      ProductModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: products,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Search products error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getSimilarProducts = async (req, res) => {
  const { id } = req.params;

  try {
    const product = await ProductModel.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const { page, limit, skip } = getPagination({ ...req.query, limit: req.query.limit || 10 });

    const filter = {
      _id: { $ne: product._id },
      category: product.category,
      status: "active",
      moderationStatus: "approved",
    };

    const [products, total] = await Promise.all([
      ProductModel.find(filter)
        .populate("vendor", "businessName businessAddress")
        .skip(skip)
        .limit(limit),
      ProductModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: products,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get similar products error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// No user behavior tracking (favorites/view-history per user) exists yet, so
// this is a "trending" fallback ranked by favoriteCount/viewCount rather than
// a personalized recommendation.
const getRecommendations = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination({ ...req.query, limit: req.query.limit || 10 });
    const filter = { status: "active", moderationStatus: "approved" };

    const [products, total] = await Promise.all([
      ProductModel.aggregate([
        { $match: filter },
        {
          $addFields: {
            popularityScore: { $add: [{ $multiply: ["$favoriteCount", 2] }, "$viewCount"] },
          },
        },
        { $sort: { popularityScore: -1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
      ]),
      ProductModel.countDocuments(filter),
    ]);

    await ProductModel.populate(products, {
      path: "vendor",
      select: "businessName businessAddress",
    });

    return res.status(200).json({
      data: products,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get recommendations error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getProductById = async (req, res) => {
  const { id } = req.params;

  try {
    const product = await ProductModel.findByIdAndUpdate(
      id,
      { $inc: { viewCount: 1 } },
      { returnDocument: "after" },
    ).populate("vendor", "businessName businessAddress");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // A rejected/pending/inactive listing is only visible to its own vendor
    // (checking their own catalog) — everyone else gets the same 404 as a
    // nonexistent product, rather than a leak that confirms it exists and
    // was rejected.
    const isOwner = req.user && product.vendor._id.toString() === req.user._id.toString();
    if (!isOwner && (product.status !== "active" || product.moderationStatus !== "approved")) {
      return res.status(404).json({ message: "Product not found" });
    }

    let isFavorited = false;

    if (req.user) {
      const [, favorite] = await Promise.all([
        ProductViewModel.findOneAndUpdate(
          { user: req.user._id, product: id },
          { viewedAt: new Date() },
          { upsert: true },
        ),
        FavoriteModel.exists({ user: req.user._id, product: id }),
      ]);
      isFavorited = Boolean(favorite);
    }

    return res.status(200).json({ product, isFavorited });
  } catch (error) {
    console.error("Get product error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getRecentlyViewed = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { user: req.user._id };

    const [views, total] = await Promise.all([
      ProductViewModel.find(filter)
        .populate({
          path: "product",
          populate: { path: "vendor", select: "businessName businessAddress" },
        })
        .sort({ viewedAt: -1 })
        .skip(skip)
        .limit(limit),
      ProductViewModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: views,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get recently viewed error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createProduct,
  editProduct,
  updateProductStatus,
  getAllProducts,
  getMyProducts,
  getProductsByCategory,
  getNearbyProducts,
  searchProducts,
  getSimilarProducts,
  getRecommendations,
  getProductById,
  getRecentlyViewed,
};
