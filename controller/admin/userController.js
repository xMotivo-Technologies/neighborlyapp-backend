const UserModel = require("../../models/User");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");

const listUsers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [users, total] = await Promise.all([
      UserModel.find().skip(skip).limit(limit),
      UserModel.countDocuments(),
    ]);

    return res.status(200).json({
      data: users,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("List users error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  listUsers,
};
