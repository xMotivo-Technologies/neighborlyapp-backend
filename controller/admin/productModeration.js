const ProductModel = require("../../models/Products");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");

const EDITABLE_FIELDS = [
  "name",
  "desc",
  "price",
  "category",
  "location",
  "condition",
  "status",
  "moderationStatus",
  "imgUrl",
];

const listProducts = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { status, moderationStatus, vendor, search, featured } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (moderationStatus) filter.moderationStatus = moderationStatus;
    if (vendor) filter.vendor = vendor;
    if (featured !== undefined) filter.featured = featured === "true";
    if (search) filter.$text = { $search: search };

    const [products, total] = await Promise.all([
      ProductModel.find(filter)
        .populate("vendor", "businessName businessAddress email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ProductModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: products,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("List products error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Admin override edit — unlike the vendor's own editProduct, there's no
// ownership check, and moderationStatus is editable here (vendors never
// touch that field themselves).
const updateProduct = async (req, res) => {
  const { id } = req.params;

  try {
    const product = await ProductModel.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) product[field] = req.body[field];
    }

    await product.save();

    return res.status(200).json({ message: "Product updated", product });
  } catch (error) {
    console.error("Admin update product error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Hard delete. Products carry no isDeleted flag the way User does, and
// completed Orders already snapshot productName/productImage/unitPrice at
// purchase time, so historical order records stay intact even after the
// product itself is gone — a populate("product") on an old order just comes
// back null instead of erroring.
const deleteProduct = async (req, res) => {
  const { id } = req.params;

  try {
    const product = await ProductModel.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.status(200).json({ message: "Product deleted" });
  } catch (error) {
    console.error("Admin delete product error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const featureProduct = async (req, res) => {
  const { id } = req.params;
  const { featured } = req.body;

  if (typeof featured !== "boolean") {
    return res.status(400).json({ message: "featured must be a boolean" });
  }

  try {
    const product = await ProductModel.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.featured = featured;
    product.featuredAt = featured ? new Date() : undefined;
    await product.save();

    return res.status(200).json({ message: `Product ${featured ? "featured" : "unfeatured"}`, product });
  } catch (error) {
    console.error("Feature product error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { listProducts, updateProduct, deleteProduct, featureProduct };
