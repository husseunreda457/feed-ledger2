import { Router } from "express";
import { z } from "zod";
import { Customer } from "../models/Customer.js";
import { Transaction } from "../models/Transaction.js";
import { balances } from "../lib/balance.js";
import { HttpError } from "../lib/http.js";
import { audit } from "../lib/audit.js";
import { ownerOnly } from "../middleware/auth.js";

const router = Router();
const fields = {
  creditLimit: z.number().int().min(0).default(0),
  discountPct: z.number().min(0).max(100).default(0),
};
const createSchema = z.object({ name: z.string().trim().min(1), phone: z.string().trim().default(""), ...fields });
const updateSchema = z.object({ name: z.string().trim().min(1), phone: z.string().trim(), ...fields }).partial();

router.get("/", async (req, res) => {
  const [customers, bal] = await Promise.all([
    Customer.find({ owner: req.user.shopId }).sort({ name: 1 }).lean(),
    balances(req.user.shopId),
  ]);
  res.json(customers.map((c) => ({ ...c, balance: bal.get(String(c._id)) || 0 })));
});

router.post("/", async (req, res) => {
  const d = createSchema.parse(req.body);
  // العامل مينفعش يحدد حد ائتماني أو خصم
  if (req.user.role === "staff") { d.creditLimit = 0; d.discountPct = 0; }
  const c = await Customer.create({ ...d, owner: req.user.shopId });
  audit(req, "create", "customer", { name: c.name });
  res.status(201).json(c);
});

// استيراد زبائن من Excel/CSV (الواجهة بتقرا الملف وتبعت صفوف JSON). الرصيد الافتتاحي اختياري.
router.post("/import", ownerOnly, async (req, res) => {
  const { rows } = z.object({
    rows: z.array(z.object({
      name: z.string().trim().min(1),
      phone: z.string().trim().default(""),
      balance: z.number().int().min(0).default(0),
    })).min(1).max(1000),
  }).parse(req.body);
  const owner = req.user.shopId;
  const created = await Customer.insertMany(rows.map((r) => ({ owner, name: r.name, phone: r.phone })));
  const opening = created
    .map((c, i) => ({ c, b: rows[i].balance }))
    .filter((x) => x.b > 0)
    .map((x) => ({ owner, customer: x.c._id, kind: "opening", total: x.b, paid: 0 }));
  if (opening.length) await Transaction.insertMany(opening);
  audit(req, "import", "customer", { count: created.length });
  res.status(201).json({ created: created.length });
});

router.get("/:id", async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, owner: req.user.shopId }).lean();
  if (!customer) throw new HttpError(404, "الزبون مش موجود");
  const [transactions, bal] = await Promise.all([
    Transaction.find({ owner: req.user.shopId, customer: customer._id })
      .sort({ date: -1, createdAt: -1 })
      .lean(),
    balances(req.user.shopId, customer._id),
  ]);
  res.json({ customer, balance: bal.get(String(customer._id)) || 0, transactions });
});

router.patch("/:id", ownerOnly, async (req, res) => {
  const d = updateSchema.parse(req.body);
  const c = await Customer.findOneAndUpdate({ _id: req.params.id, owner: req.user.shopId }, d, { new: true });
  if (!c) throw new HttpError(404, "الزبون مش موجود");
  audit(req, "edit", "customer", { name: c.name, ...d });
  res.json(c);
});

export default router;
