import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Supplier, SupplierTx } from "../models/Supplier.js";
import { Product } from "../models/Product.js";
import { HttpError } from "../lib/http.js";
import { audit } from "../lib/audit.js";
import { packBaseOf } from "../lib/ledger.js";

const router = Router(); // كله للمالك بس (من index.js)
const id = z.string().regex(/^[a-f0-9]{24}$/i, "معرّف غير صحيح");
const pos = z.number().int().positive();

// اللي المحل عليه للمورد = مجموع (إجمالي المشتريات - المدفوع)
export async function supplierBalances(owner, supplierId) {
  const match = { owner: new mongoose.Types.ObjectId(owner) };
  if (supplierId) match.supplier = new mongoose.Types.ObjectId(supplierId);
  const rows = await SupplierTx.aggregate([
    { $match: match },
    { $group: { _id: "$supplier", balance: { $sum: { $subtract: ["$total", "$paid"] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.balance]));
}
async function getSupplier(owner, sid) {
  const s = await Supplier.findOne({ _id: sid, owner });
  if (!s) throw new HttpError(404, "المورد مش موجود");
  return s;
}

router.get("/", async (req, res) => {
  const [list, bal] = await Promise.all([
    Supplier.find({ owner: req.user.shopId }).sort({ name: 1 }).lean(),
    supplierBalances(req.user.shopId),
  ]);
  res.json(list.map((s) => ({ ...s, balance: bal.get(String(s._id)) || 0 })));
});

router.post("/", async (req, res) => {
  const d = z.object({ name: z.string().trim().min(1), phone: z.string().trim().default("") }).parse(req.body);
  const s = await Supplier.create({ ...d, owner: req.user.shopId });
  audit(req, "create", "supplier", { name: s.name });
  res.status(201).json(s);
});

router.get("/:id", async (req, res) => {
  const s = await getSupplier(req.user.shopId, req.params.id);
  const [txs, bal] = await Promise.all([
    SupplierTx.find({ owner: req.user.shopId, supplier: s._id }).sort({ date: -1, createdAt: -1 }).lean(),
    supplierBalances(req.user.shopId, s._id),
  ]);
  res.json({ supplier: s, balance: bal.get(String(s._id)) || 0, transactions: txs });
});

// شراء من المورد: بيزوّد المخزون لوحده ويسجّل آخر سعر شراء وتاريخ الصلاحية
router.post("/:id/purchase", async (req, res) => {
  const d = z
    .object({
      items: z.array(z.object({ productId: id, packs: pos, unitCost: pos, expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })).min(1).max(30),
      paid: z.number().int().min(0).default(0),
    })
    .parse(req.body);
  const owner = req.user.shopId;
  const s = await getSupplier(owner, req.params.id);
  const prods = await Product.find({ _id: { $in: d.items.map((i) => i.productId) }, owner });
  const byId = new Map(prods.map((p) => [p.id, p]));
  const items = d.items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new HttpError(404, "صنف مش موجود");
    return { p, packs: i.packs, unitCost: i.unitCost, exp: i.expiresAt, line: { product: p._id, name: p.name, unit: p.packName, packs: i.packs, unitCost: i.unitCost, total: i.packs * i.unitCost } };
  });
  const total = items.reduce((t, i) => t + i.line.total, 0);
  if (d.paid > total) throw new HttpError(400, "المدفوع أكبر من إجمالي الفاتورة");

  for (const i of items) {
    const upd = { $inc: { qtyBase: i.packs * packBaseOf(i.p) }, $set: { lastCost: i.unitCost } };
    if (i.exp) {
      const e = new Date(i.exp);
      if (!i.p.expiresAt || i.p.qtyBase <= 0 || e < i.p.expiresAt) upd.$set.expiresAt = e;
    }
    await Product.updateOne({ _id: i.p._id, owner }, upd);
  }
  const tx = await SupplierTx.create({ owner, supplier: s._id, kind: "purchase", items: items.map((i) => i.line), total, paid: d.paid });
  audit(req, "create", "purchase", { name: s.name, total });
  res.status(201).json(tx);
});

router.post("/:id/payment", async (req, res) => {
  const d = z.object({ amount: pos }).parse(req.body);
  const owner = req.user.shopId;
  const s = await getSupplier(owner, req.params.id);
  const bal = (await supplierBalances(owner, s._id)).get(String(s._id)) || 0;
  if (d.amount > bal) throw new HttpError(400, "المبلغ أكبر من المتبقي للمورد");
  const tx = await SupplierTx.create({ owner, supplier: s._id, kind: "payment", paid: d.amount });
  audit(req, "create", "supplier-payment", { name: s.name, amount: d.amount });
  res.status(201).json(tx);
});

export default router;
