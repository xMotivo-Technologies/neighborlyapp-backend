const express = require("express");
const { authToken, isVendor } = require("../../middleware/auth");
const {
  createProduct,
  editProduct,
  getAllProducts,
  getProductsByCategory,
  getProductById,
} = require("../../controller/product/productController");

const router = express.Router();

router.post("/newproduct", authToken, isVendor, createProduct);
router.put("/editproduct/:id", authToken, isVendor, editProduct);
router.get("/allproducts", getAllProducts);
router.get("/categories/:categoryName", getProductsByCategory);
router.get("/product/:id", getProductById);

module.exports = router;
