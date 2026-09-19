const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const { listProducts, updateProduct, deleteProduct, featureProduct } = require("../../controller/admin/productModeration");

const router = express.Router();

router.get("/products", verifyAdmin, listProducts);
router.put("/products/:id", verifyAdmin, updateProduct);
router.delete("/products/:id", verifyAdmin, deleteProduct);
router.put("/products/:id/feature", verifyAdmin, featureProduct);

module.exports = router;
