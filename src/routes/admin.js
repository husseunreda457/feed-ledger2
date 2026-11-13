import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { Customer } from "../models/Customer.js";
import { HttpError } from "../lib/http.js";
import { subscriptionStatus } from "../lib/ledger.js";

const router = Router();

router.get("/users", async (req, res) => {
  const [owners, counts] = await Promise.all([
    User.find(
      { role: "owner" },
      "name shopName email createdAt trialEndsAt paidUntil disabled",
    )
      .sort({ createdAt: -1 })
      .lean(),
    Customer.aggregate([{ $group: { _id: "$owner", n: { $sum: 1 } } }]),
  ]);
  const n = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(
    owners.map((o) => ({
      ...o,
      customers: n.get(String(o._id)) || 0,
      sub: subscriptionStatus(o),
    })),
  );
});

// تفعيل اشتراك بعد استلام التحويل (فودافون كاش / إنستاباي)
router.post("/users/:id/activate", async (req, res) => {
  const { months } = z
    .object({ months: z.number().int().min(1).max(24) })
    .parse(req.body);
  const o = await User.findOne({ _id: req.params.id, role: "owner" });
  if (!o) throw new HttpError(404, "المستخدم مش موجود");

  // ابدأ الحساب دائماً من تاريخ اليوم الحالي
  const base = new Date();
  base.setMonth(base.getMonth() + Number(months));
  o.paidUntil = base;

  await o.save();
  res.json({ paidUntil: o.paidUntil });
});

router.post("/users/:id/toggle", async (req, res) => {
  const o = await User.findOne({ _id: req.params.id, role: "owner" });
  if (!o) throw new HttpError(404, "المستخدم مش موجود");
  o.disabled = !o.disabled;
  await o.save();
  res.json({ disabled: o.disabled });
});

// حذف مستخدم (صاحب محل) نهائياً
router.delete("/users/:id", async (req, res) => {
  const o = await User.findOneAndDelete({ _id: req.params.id, role: "owner" });
  if (!o) throw new HttpError(404, "المستخدم مش موجود");
  res.json({ success: true });
});

export default router;
