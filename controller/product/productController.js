const ProductModel = require("../../models/Products");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");

const createProduct = async (req, res) => {
  const { name, desc, imgUrl, price, category, location } = req.body;

  if (!name || !desc || !imgUrl || price === undefined || !location) {
    return res.status(400).json({
      message: "name, desc, imgUrl, price and location are required",
    });
  }

  try {
    const product = await ProductModel.create({
      name,
      desc,
      imgUrl,
      price,
      category,
      location,
      vendor: req.user._id,
    });

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
  const { name, desc, imgUrl, price, category, location } = req.body;

  try {
    const product = await ProductModel.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You cannot edit this product" });
    }

    if (name !== undefined) product.name = name;
    if (desc !== undefined) product.desc = desc;
    if (imgUrl !== undefined) product.imgUrl = imgUrl;
    if (price !== undefined) product.price = price;
    if (category !== undefined) product.category = category;
    if (location !== undefined) product.location = location;

    await product.save();

    return res.status(200).json({
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Edit product error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [products, total] = await Promise.all([
      ProductModel.find()
        .populate("vendor", "businessName businessAddress")
        .skip(skip)
        .limit(limit),
      ProductModel.countDocuments(),
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

const getProductsByCategory = async (req, res) => {
  const { categoryName } = req.params;

  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { category: categoryName };

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

const getProductById = async (req, res) => {
  const { id } = req.params;

  try {
    const product = await ProductModel.findById(id).populate(
      "vendor",
      "businessName businessAddress",
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.status(200).json({ product });
  } catch (error) {
    console.error("Get product error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createProduct,
  editProduct,
  getAllProducts,
  getProductsByCategory,
  getProductById,
};
