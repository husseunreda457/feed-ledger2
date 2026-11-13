import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    creditLimit: { type: Number, default: 0, min: 0 }, // بالقروش، 0 = من غير حد
    discountPct: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

export const Customer = mongoose.model("Customer", customerSchema);
