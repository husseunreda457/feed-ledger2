import { Router } from "express";
import { z } from "zod";
import { Customer } from "../models/Customer.js";
import { Product } from "../models/Product.js";
import { Transaction } from "../models/Transaction.js";
import { balances } from "../lib/balance.js";
import { HttpError } from "../lib/http.js";
import { audit } from "../lib/audit.js";
import { ownerOnly } from "../middleware/auth.js";
import { exceedsLimit, makesNegative, packBaseOf, validQty, lineTotal, invoiceTotal } from "../lib/ledger.js";

const router = Router();
const id = z.string().regex(/^[a-f0-9]{24}$/i, "معرّف غير صحيح");
const pos = z.number().int().positive();
const dateField = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional();
// qty: عدد الشيكاير لو mode=pack، أو عدد الجرامات لو mode=kg
const itemIn = z.object({ productId: id, mode: z.enum(["pack", "kg"]), qty: pos, unitPrice: pos });

async function getCustomer(owner, customerId) {
  const c = await Customer.findOne({ _id: customerId, owner });
  if (!c) throw new HttpError(404, "الزبون مش موجود");
  return c;
}
const balanceOf = async (owner, customerId) => (await balances(owner, customerId)).get(String(customerId)) || 0;

// بيحوّل سطور الطلب لسطور فاتورة، وبيحسب الإجمالي في السيرفر (مبنثقش في حساب الواجهة)
async function buildItems(owner, raw) {
  const prods = await Product.find({ _id: { $in: [...new Set(raw.map((r) => r.productId))] }, owner });
  const byId = new Map(prods.map((p) => [p.id, p]));
  return raw.map((r) => {
    const p = byId.get(r.productId);
    if (!p) throw new HttpError(404, "صنف مش موجود");
    const packBase = packBaseOf(p);
    const qtyBase = r.mode === "pack" ? r.qty * packBase : r.qty;
    if (!validQty(r.mode, qtyBase, packBase, p.packGrams > 0)) {
      throw new HttpError(400, `كمية غير صحيحة للصنف ${p.name}`);
    }
    const total = lineTotal({ mode: r.mode, qtyBase, packBase, unitPrice: r.unitPrice });
    return { product: p._id, name: p.name, unit: r.mode === "pack" ? p.packName : "كجم", mode: r.mode, qtyBase, packBase, unitPrice: r.unitPrice, total };
  });
}

// خصم ذري لكل صنف (بينجح بس لو الكمية كافية). لو أي سطر فشل بنرجّع اللي اتخصم قبله.
async function takeStock(owner, items) {
  const done = [];
  try {
    for (const it of items) {
      const p = await Product.findOneAndUpdate({ _id: it.product, owner, qtyBase: { $gte: it.qtyBase } }, { $inc: { qtyBase: -it.qtyBase } });
      if (!p) throw new HttpError(400, `الكمية مش كفاية من ${it.name}`);
      done.push(it);
    }
  } catch (e) {
    await giveStock(owner, done);
    throw e;
  }
}
const giveStock = (owner, items) =>
  Promise.all(items.map((it) => Product.updateOne({ _id: it.product, owner }, { $inc: { qtyBase: it.qtyBase } })));

// ---------- بيع: فاتورة بأكتر من صنف. من غير customerId = بيع نقدي قطاعي ----------
router.post("/sale", async (req, res) => {
  const d = z
    .object({ customerId: id.optional(), items: z.array(itemIn).min(1).max(30), paid: z.number().int().min(0).optional(), force: z.boolean().optional() })
    .parse(req.body);
  const owner = req.user.shopId;
  const items = await buildItems(owner, d.items);
  const total = invoiceTotal(items);

  let customer = null;
  let paid = total; // النقدي بيتدفع كله
  if (d.customerId) {
    customer = await getCustomer(owner, d.customerId);
    paid = d.paid ?? 0;
    if (paid > total) throw new HttpError(400, "المدفوع أكبر من الإجمالي");
    const bal = await balanceOf(owner, customer.id);
    if (exceedsLimit(customer.creditLimit, bal, total - paid) && !d.force) {
      throw new HttpError(409, "الدين هيعدي الحد الائتماني للزبون", "CREDIT_LIMIT");
    }
  }
  await takeStock(owner, items);
  const tx = await Transaction.create({ owner, customer: customer?.id, retail: !customer, kind: "sale", items, total, paid });
  audit(req, "create", "sale", { customer: customer?.name || "نقدي", lines: items.length, total });
  res.status(201).json(tx);
});

// تعديل المدفوع في فاتورة آجل (للمالك بس). لتعديل الأصناف: احذف الفاتورة وسجّلها تاني (المخزون بيرجع لوحده).
router.patch("/sale/:id", ownerOnly, async (req, res) => {
  const d = z.object({ paid: z.number().int().min(0) }).parse(req.body);
  const owner = req.user.shopId;
  const tx = await Transaction.findOne({ _id: req.params.id, owner, kind: "sale", customer: { $ne: null } });
  if (!tx) throw new HttpError(404, "الفاتورة مش موجودة");
  if (d.paid > tx.total) throw new HttpError(400, "المدفوع أكبر من الإجمالي");
  const bal = await balanceOf(owner, tx.customer);
  const after = bal - (tx.total - tx.paid) + (tx.total - d.paid);
  if (makesNegative(bal, after)) throw new HttpError(400, "التعديل ده هيخلي حساب الزبون بالسالب");
  const before = { paid: tx.paid };
  tx.paid = d.paid;
  await tx.save();
  audit(req, "edit", "sale", { before, after: d });
  res.json(tx);
});

// ---------- دفعة ----------
router.post("/payment", async (req, res) => {
  const d = z.object({ customerId: id, amount: pos, date: dateField }).parse(req.body);
  const owner = req.user.shopId;
  const customer = await getCustomer(owner, d.customerId);
  const bal = await balanceOf(owner, customer.id);
  if (d.amount > bal) throw new HttpError(400, "المبلغ أكبر من المتبقي على الزبون");
  const tx = await Transaction.create({
    owner, customer: customer.id, kind: "payment", paid: d.amount, date: d.date ? new Date(d.date) : new Date(),
  });
  audit(req, "create", "payment", { customer: customer.name, amount: d.amount });
  res.status(201).json(tx);
});

router.patch("/payment/:id", ownerOnly, async (req, res) => {
  const d = z.object({ amount: pos, date: dateField }).parse(req.body);
  const owner = req.user.shopId;
  const tx = await Transaction.findOne({ _id: req.params.id, owner, kind: "payment" });
  if (!tx) throw new HttpError(404, "الدفعة مش موجودة");
  const bal = await balanceOf(owner, tx.customer);
  if (d.amount > bal + tx.paid) throw new HttpError(400, "المبلغ أكبر من المتبقي على الزبون");
  const before = { amount: tx.paid };
  tx.paid = d.amount;
  if (d.date) tx.date = new Date(d.date);
  await tx.save();
  audit(req, "edit", "payment", { before, after: { amount: d.amount } });
  res.json(tx);
});

// ---------- مرتجع (شيكاير أو كيلوهات) ----------
router.post("/return", async (req, res) => {
  const d = z.object({ customerId: id, items: z.array(itemIn).min(1).max(30) }).parse(req.body);
  const owner = req.user.shopId;
  const customer = await getCustomer(owner, d.customerId);
  const items = await buildItems(owner, d.items);
  await giveStock(owner, items);
  const tx = await Transaction.create({ owner, customer: customer.id, kind: "return", items, total: -invoiceTotal(items) });
  audit(req, "create", "return", { customer: customer.name, lines: items.length });
  res.status(201).json(tx);
});

// ---------- حذف أي عملية (للمالك بس) ----------
router.delete("/:id", ownerOnly, async (req, res) => {
  const owner = req.user.shopId;
  const tx = await Transaction.findOne({ _id: req.params.id, owner });
  if (!tx) throw new HttpError(404, "العملية مش موجودة");

  if (tx.customer) {
    const bal = await balanceOf(owner, tx.customer);
    if (makesNegative(bal, bal - (tx.total - tx.paid))) {
      throw new HttpError(400, "مينفعش تحذف العملية دي لأن الحساب هيبقى بالسالب. احذف الدفعات المرتبطة بيها الأول.");
    }
  }
  if (tx.kind === "sale") await giveStock(owner, tx.items);
  else if (tx.kind === "return") await takeStock(owner, tx.items); // بيفشل لو الكمية اتباعت بعد المرتجع
  await tx.deleteOne();
  audit(req, "delete", tx.kind, { total: tx.total, paid: tx.paid, lines: tx.items.length });
  res.status(204).end();
});

export default router;
