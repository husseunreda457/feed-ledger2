import { Router } from "express";
import { Customer } from "../models/Customer.js";
import { Transaction } from "../models/Transaction.js";
import { balances } from "../lib/balance.js";
import { toCsv } from "../lib/ledger.js";

const router = Router();
const pounds = (pi) => pi / 100;
const day = (d) => new Date(d).toLocaleDateString("en-CA");
const send = (res, name, csv) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(csv);
};

// ملفات CSV بتتفتح في Excel مباشرة (فيها BOM للعربي)
router.get("/customers.csv", async (req, res) => {
  const [customers, bal] = await Promise.all([
    Customer.find({ owner: req.user.shopId }).sort({ name: 1 }).lean(),
    balances(req.user.shopId),
  ]);
  send(res, "customers.csv", toCsv(
    ["الاسم", "التليفون", "الحد الائتماني", "خصم %", "المتبقي"],
    customers.map((c) => [c.name, c.phone, pounds(c.creditLimit), c.discountPct, pounds(bal.get(String(c._id)) || 0)])
  ));
});

router.get("/transactions.csv", async (req, res) => {
  const txs = await Transaction.find({ owner: req.user.shopId }).sort({ date: -1 }).populate("customer", "name").lean();
  const kinds = { sale: "بيع", payment: "دفعة", return: "مرتجع", opening: "رصيد افتتاحي" };
  const qty = (it) => (it.mode === "pack" ? `${it.qtyBase / it.packBase} ${it.unit}` : `${it.qtyBase / 1000} كجم`);
  const rows = [];
  for (const t of txs) {
    const who = t.customer?.name || (t.retail ? "بيع نقدي" : "");
    if (t.items?.length) {
      t.items.forEach((it, i) =>
        rows.push([day(t.date), who, kinds[t.kind], it.name, qty(it), pounds(it.unitPrice), pounds(it.total) * (t.kind === "return" ? -1 : 1), i === 0 ? pounds(t.paid) : ""])
      );
    } else rows.push([day(t.date), who, kinds[t.kind], "", "", "", pounds(t.total), pounds(t.paid)]);
  }
  send(res, "transactions.csv", toCsv(["التاريخ", "الزبون", "النوع", "الصنف", "الكمية", "سعر الوحدة", "إجمالي السطر", "المدفوع (للفاتورة)"], rows));
});

export default router;
