import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    shopName: { type: String, trim: true, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // owner: صاحب محل | staff: عامل تابع لصاحب محل | admin: إنت (صاحب المنتج)
    role: { type: String, enum: ["owner", "staff", "admin"], default: "owner" },
    shop: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // للعامل: صاحب المحل
    trialEndsAt: Date,
    paidUntil: Date,
    disabled: { type: Boolean, default: false },
    resetTokenHash: String,
    resetExpires: Date,
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
