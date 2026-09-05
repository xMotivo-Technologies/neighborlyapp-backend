const UserModel = require("../../models/User");
const bcrypt = require("bcrypt");

const handleRegister = async (req, res) => {
  const { email, phoneNumber, password, firstName, lastName } = req.body;

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // 1. Check if user already exists (active or deleted)
    const existingUser = await UserModel.findOne({
      $or: [
        { email: normalizedEmail },
        { phoneNumber: phoneNumber },
      ],
    });

    // 2. If user exists
    if (existingUser) {
      
      if (!existingUser.isDeleted) {
        if (existingUser.email === normalizedEmail) {
          return res.status(400).json({ message: "Email already exists" });
        }

        if (existingUser.phoneNumber === phoneNumber) {
          return res.status(400).json({ message: "Phone number already exists" });
        }
      }

      // CASE B: User was deleted → RESTORE account
      if (existingUser.isDeleted) {
        const hashedPassword = await bcrypt.hash(password, 10);

        existingUser.isDeleted = false;
        existingUser.deletedAt = null;
        existingUser.firstName = firstName;
        existingUser.lastName = lastName;
        existingUser.phoneNumber = phoneNumber;
        existingUser.hashPass = hashedPassword;

        await existingUser.save();

        return res.status(200).json({
          message: "Account restored successfully",
        });
      }
    }

    // 3. If no user exists → create new one
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await UserModel.create({
      email: normalizedEmail,
      phoneNumber,
      hashPass: hashedPassword,
      firstName,
      lastName,
      isDeleted: false,
    });

    return res.status(201).json({
      message: "Account created successfully",
      user: {
        id: newUser._id,
        email: newUser.email,
        firstName: newUser.firstName,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

module.exports = {
  handleRegister,
};