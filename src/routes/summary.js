import { Router } from "express";
import mongoose from "mongoose";
import { Transaction } from "../models/Transaction.js";
import { Customer } from "../models/Customer.js";
import { Product } from "../models/Product.js";
import { balances } from "../lib/balance.js";
import { supplierBalances } from "./suppliers.js";

const router = Router();
const LOW_PACKS = 5; // الصنف بيتعتبر "قرب يخلص" لو أقل من أو يساوي 5 شيكاير

router.get("/", async (req, res) => {
  const owner = new mongoose.Types.ObjectId(req.user.shopId);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);

  const sums = (from) =>
    Transaction.aggregate([
      { $match: { owner, date: { $gte: from }, kind: { $ne: "opening" } } },
      { $group: { _id: null, sales: { $sum: "$total" }, collected: { $sum: "$paid" } } },
    ]);

  const [today, month, cash, topRows, bal, supBal, prods] = await Promise.all([
    sums(dayStart),
    sums(monthStart),
    Transaction.aggregate([
      { $match: { owner, date: { $gte: dayStart }, retail: true } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    // أكتر صنف مبيعاً بالقيمة (المرتجع بيتخصم)
    Transaction.aggregate([
      { $match: { owner, date: { $gte: monthStart }, kind: { $in: ["sale", "return"] } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.product", name: { $first: "$items.name" }, value: { $sum: { $cond: [{ $eq: ["$kind", "sale"] }, "$items.total", { $multiply: ["$items.total", -1] }] } } } },
      { $sort: { value: -1 } },
      { $limit: 1 },
    ]),
    balances(req.user.shopId),
    supplierBalances(req.user.shopId),
    Product.find({ owner }, "name packName packGrams qtyBase expiresAt").lean(),
  ]);

  const debtors = [...bal.entries()].filter(([k, b]) => k !== "null" && b > 0).sort((a, b) => b[1] - a[1]);
  const names = await Customer.find({ _id: { $in: debtors.slice(0, 3).map(([k]) => k) } }, "name").lean();
  const nameOf = new Map(names.map((c) => [String(c._id), c.name]));

  const soon = Date.now() + 30 * 864e5;
  const low = prods.filter((p) => p.qtyBase <= LOW_PACKS * (p.packGrams > 0 ? p.packGrams : 1)).map((p) => ({ id: p._id, name: p.name }));
  const expiring = prods.filter((p) => p.qtyBase > 0 && p.expiresAt && p.expiresAt.getTime() <= soon).map((p) => ({ id: p._id, name: p.name, expiresAt: p.expiresAt }));

  res.json({
    todaySales: today[0]?.sales || 0,
    todayCollected: today[0]?.collected || 0,
    todayCash: cash[0]?.total || 0,
    monthSales: month[0]?.sales || 0,
    totalDebts: debtors.reduce((s, [, b]) => s + b, 0),
    owedToSuppliers: [...supBal.values()].filter((b) => b > 0).reduce((s, b) => s + b, 0),
    topProduct: topRows[0] ? { name: topRows[0].name, value: topRows[0].value } : null,
    topDebtors: debtors.slice(0, 3).map(([k, b]) => ({ id: k, name: nameOf.get(k) || "—", balance: b })),
    lowStock: low,
    expiring,
  });
});

export default router;
