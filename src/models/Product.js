import mongoose from "mongoose";

// المخزون بيتخزّن بوحدة أساسية (qtyBase) أعداد صحيحة:
//  - صنف بيتوزن (علف): qtyBase بالجرام، والشيكارة = packGrams جرام (مثلاً 50000 للشيكارة 50 كجم)
//  - صنف بالقطعة (علبة دوا): packGrams = 0 و qtyBase عدد القطع
// كل الأسعار بالقروش.
const productSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    packName: { type: String, trim: true, default: "شيكارة" },
    packGrams: { type: Number, default: 0, min: 0 },
    price: { type: Number, required: true, min: 1 },      // سعر الشيكارة (أو القطعة)
    pricePerKg: { type: Number, default: 0, min: 0 },      // سعر الكيلو قطاعي (0 = يتحسب من سعر الشيكارة)
    qtyBase: { type: Number, required: true, min: 0, default: 0 },
    lastCost: { type: Number, default: 0, min: 0 },        // آخر سعر شراء للشيكارة من المورد
    expiresAt: Date,                                        // أقرب تاريخ صلاحية للمخزون الحالي
  },
  { timestamps: true }
);

export const Product = mongoose.model("Product", productSchema);
