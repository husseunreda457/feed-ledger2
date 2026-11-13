import { Router } from "express";
import { z } from "zod";
import { Product } from "../models/Product.js";
import { HttpError } from "../lib/http.js";
import { audit } from "../lib/audit.js";
import { ownerOnly } from "../middleware/auth.js";
import { packBaseOf } from "../lib/ledger.js";

const router = Router();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

router.get("/", async (req, res) => {
  res.json(await Product.find({ owner: req.user.shopId }).sort({ name: 1 }));
});

router.post("/", ownerOnly, async (req, res) => {
  const d = z
    .object({
      name: z.string().trim().min(1),
      packName: z.string().trim().min(1).default("شيكارة"),
      packGrams: z.number().int().min(0).default(0), // 0 = بيتباع بالقطعة
      price: z.number().int().positive(),
      pricePerKg: z.number().int().min(0).default(0),
      packs: z.number().int().min(0).default(0), // كمية افتتاحية بالشيكاير
      expiresAt: dateStr.optional(),
    })
    .parse(req.body);
  const { packs, expiresAt, ...rest } = d;
  const p = await Product.create({
    ...rest,
    owner: req.user.shopId,
    qtyBase: packs * packBaseOf(rest),
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  });
  audit(req, "create", "product", { name: p.name });
  res.status(201).json(p);
});

// تعديل صنف موجود
router.put("/:id", ownerOnly, async (req, res) => {
  try {
    const d = z
      .object({
        name: z.string().trim().min(1).optional(),
        packName: z.string().trim().min(1).optional(),
        packGrams: z.number().int().min(0).optional(),
        price: z.number().int().positive().optional(),
        pricePerKg: z.number().int().min(0).optional(),
      })
      .parse(req.body);

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.shopId },
      { $set: d },
      { new: true },
    );

    if (!updatedProduct) {
      return res.status(404).json({ error: "الصنف غير موجود" });
    }

    await audit(req, "UPDATE_PRODUCT", `تعديل صنف: ${updatedProduct.name}`);

    res.json(updatedProduct);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// حذف صنف موجود
router.delete("/:id", ownerOnly, async (req, res) => {
  try {
    const deletedProduct = await Product.findOneAndDelete({
      _id: req.params.id,
      owner: req.user.shopId,
    });

    if (!deletedProduct) {
      return res.status(404).json({ error: "الصنف غير موجود" });
    }

    await audit(req, "DELETE_PRODUCT", `حذف صنف: ${deletedProduct.name}`);
    res.json({ message: "تم حذف الصنف بنجاح", id: deletedProduct._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// تعديل سريع للأسعار والأسماء
router.patch("/:id", ownerOnly, async (req, res) => {
  const d = z
    .object({
      name: z.string().trim().min(1),
      packName: z.string().trim().min(1),
      price: z.number().int().positive(),
      pricePerKg: z.number().int().min(0),
    })
    .partial()
    .parse(req.body);
  const p = await Product.findOneAndUpdate(
    { _id: req.params.id, owner: req.user.shopId },
    d,
    { new: true },
  );
  if (!p) throw new HttpError(404, "الصنف مش موجود");
  audit(req, "edit", "product", { name: p.name, ...d });
  res.json(p);
});

// توريد: زيادة المخزون بشيكاير و/أو كيلوهات سايبة + تاريخ صلاحية اختياري
router.post("/:id/restock", ownerOnly, async (req, res) => {
  const d = z
    .object({
      packs: z.number().int().min(0).default(0),
      grams: z.number().int().min(0).default(0),
      expiresAt: dateStr.optional(),
    })
    .parse(req.body);
  const p = await Product.findOne({
    _id: req.params.id,
    owner: req.user.shopId,
  });
  if (!p) throw new HttpError(404, "الصنف مش موجود");
  if (d.grams > 0 && !(p.packGrams > 0))
    throw new HttpError(400, "الصنف ده بيتباع بالقطعة، مفيش كيلوهات");
  const add = d.packs * packBaseOf(p) + d.grams;
  if (add <= 0) throw new HttpError(400, "اكتب كمية التوريد");
  const upd = { $inc: { qtyBase: add } };
  if (d.expiresAt) {
    const e = new Date(d.expiresAt);
    if (!p.expiresAt || p.qtyBase <= 0 || e < p.expiresAt)
      upd.$set = { expiresAt: e }; // بنحتفظ بأقرب صلاحية
  }
  const out = await Product.findOneAndUpdate(
    { _id: p._id, owner: req.user.shopId },
    upd,
    { new: true },
  );
  audit(req, "edit", "product", { name: p.name, restock: add });
  res.json(out);
});

export default router;
