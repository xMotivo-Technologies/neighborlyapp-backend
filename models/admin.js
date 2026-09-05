const mongoose = require("mongoose");
const { Schema } = mongoose;

const adminSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    hashPass: {
      select: false,
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

const AdminModel = mongoose.models.Admin || mongoose.model("Admin", adminSchema);
module.exports = AdminModel;
