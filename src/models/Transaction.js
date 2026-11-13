import mongoose from "mongoose";

// سطر في الفاتورة. بنخزّن نسخة من الاسم والوحدة عشان الفاتورة القديمة تفضل مفهومة
// حتى لو الصنف اتغير اسمه بعدين.
const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: String,
    unit: String,                                   // "شيكارة" أو "كجم"
    mode: { type: String, enum: ["pack", "kg"] },
    qtyBase: Number,                                // الكمية بالوحدة الأساسية (جرام أو قطعة)
    packBase: Number,                               // حجم الشيكارة وقت البيع
    unitPrice: Number,                              // سعر الشيكارة أو الكيلو وقت البيع
    total: Number,                                  // موجب دايماً (المرتجع سالب على مستوى الفاتورة)
  },
  { _id: false }
);

// كل حاجة بتحصل في الحساب (بيع / دفعة / مرتجع / رصيد افتتاحي) سجل واحد هنا
const transactionSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" }, // فاضي في البيع النقدي القطاعي
    retail: { type: Boolean, default: false },                           // بيع نقدي قطاعي
    kind: { type: String, enum: ["sale", "payment", "return", "opening"], required: true },
    items: [itemSchema],
    total: { type: Number, default: 0 }, // سالب في المرتجع
    paid: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
transactionSchema.index({ owner: 1, customer: 1, date: -1 });

export const Transaction = mongoose.model("Transaction", transactionSchema);
