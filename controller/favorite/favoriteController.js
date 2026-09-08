const FavoriteModel = require("../../models/Favorite");
const ProductModel = require("../../models/Products");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");

const addFavorite = async (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ message: "productId is required" });
  }

  try {
    const product = await ProductModel.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const favorite = await FavoriteModel.create({
      user: req.user._id,
      product: productId,
    });

    await ProductModel.findByIdAndUpdate(productId, { $inc: { favoriteCount: 1 } });

    return res.status(201).json({ message: "Product favorited", favorite });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Product already favorited" });
    }

    console.error("Add favorite error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// :id here is the product id, not the Favorite document's own _id.
const removeFavorite = async (req, res) => {
  const { id } = req.params;

  try {
    const favorite = await FavoriteModel.findOneAndDelete({
      user: req.user._id,
      product: id,
    });

    if (!favorite) {
      return res.status(404).json({ message: "Favorite not found" });
    }

    await ProductModel.findByIdAndUpdate(id, { $inc: { favoriteCount: -1 } });

    return res.status(200).json({ message: "Product unfavorited" });
  } catch (error) {
    console.error("Remove favorite error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const listFavorites = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { user: req.user._id };

    const [favorites, total] = await Promise.all([
      FavoriteModel.find(filter)
        .populate({
          path: "product",
          populate: { path: "vendor", select: "businessName businessAddress" },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      FavoriteModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: favorites,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("List favorites error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  addFavorite,
  removeFavorite,
  listFavorites,
};
