const mongoose = require("mongoose");
const { Schema } = mongoose;

const favoriteSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
  },
  { timestamps: true },
);

favoriteSchema.index({ user: 1, product: 1 }, { unique: true });

const FavoriteModel = mongoose.models.Favorite || mongoose.model("Favorite", favoriteSchema);
module.exports = FavoriteModel;
