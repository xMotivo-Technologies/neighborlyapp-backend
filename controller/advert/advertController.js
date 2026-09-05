const AdvertModel = require("../../models/Advert");
const ProductModel = require("../../models/Products");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");

const requestAdvert = async (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ message: "productId is required" });
  }

  try {
    const product = await ProductModel.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You do not own this product" });
    }

    const advert = await AdvertModel.create({
      vendor: req.user._id,
      product: productId,
      status: "pending",
    });

    return res.status(201).json({
      message: "Advert request submitted and pending admin approval",
      advert,
    });
  } catch (error) {
    console.error("Request advert error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getUserAdverts = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { vendor: req.user._id };

    const [adverts, total] = await Promise.all([
      AdvertModel.find(filter)
        .populate("product", "name price imgUrl")
        .skip(skip)
        .limit(limit),
      AdvertModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: adverts,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get user adverts error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  requestAdvert,
  getUserAdverts,
};
