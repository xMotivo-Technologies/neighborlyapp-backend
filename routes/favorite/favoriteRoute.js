const express = require("express");
const { authToken } = require("../../middleware/auth");
const {
  addFavorite,
  removeFavorite,
  listFavorites,
} = require("../../controller/favorite/favoriteController");

const router = express.Router();

router.post("/favorites", authToken, addFavorite);
router.delete("/favorites/:id", authToken, removeFavorite);
router.get("/favorites", authToken, listFavorites);

module.exports = router;
