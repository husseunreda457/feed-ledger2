import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

// مشتريات المحل من المورد (purchase) والمدفوع له (payment). الرصيد = اللي المحل عليه للمورد.
const supplierTxSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    kind: { type: String, enum: ["purchase", "payment"], required: true },
    items: [{ _id: false, product: mongoose.Schema.Types.ObjectId, name: String, unit: String, packs: Number, unitCost: Number, total: Number }],
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
supplierTxSchema.index({ owner: 1, supplier: 1, date: -1 });

export const Supplier = mongoose.model("Supplier", supplierSchema);
export const SupplierTx = mongoose.model("SupplierTx", supplierTxSchema);
