const express = require("express");
const { authToken, optionalAuth, isVendor } = require("../../middleware/auth");
const upload = require("../../middleware/multer");
const {
  createProduct,
  editProduct,
  updateProductStatus,
  getAllProducts,
  getProductsByCategory,
  getNearbyProducts,
  searchProducts,
  getSimilarProducts,
  getRecommendations,
  getProductById,
  getRecentlyViewed,
} = require("../../controller/product/productController");

const router = express.Router();

router.post("/newproduct", authToken, isVendor, upload.array("images", 6), createProduct);
router.put("/editproduct/:id", authToken, isVendor, upload.array("images", 6), editProduct);
router.put("/products/:id/status", authToken, isVendor, updateProductStatus);
router.get("/allproducts", getAllProducts);
router.get("/categories/:categoryName", getProductsByCategory);
router.get("/products/nearby", getNearbyProducts);
router.get("/products/search", searchProducts);
router.get("/products/recommendations", getRecommendations);
router.get("/products/recently-viewed", authToken, getRecentlyViewed);
router.get("/products/:id/similar", getSimilarProducts);
router.get("/product/:id", optionalAuth, getProductById);

module.exports = router;
