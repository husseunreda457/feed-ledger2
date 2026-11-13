import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User.js";
import { HttpError } from "../lib/http.js";
import { audit } from "../lib/audit.js";

const router = Router();

router.get("/", async (req, res) => {
  res.json(await User.find({ shop: req.user.shopId, role: "staff" }, "name email createdAt").sort({ createdAt: -1 }).lean());
});

router.post("/", async (req, res) => {
  const d = z.object({ name: z.string().trim().min(2), email: z.string().trim().email(), password: z.string().min(8, "الباسورد 8 حروف على الأقل") }).parse(req.body);
  if (await User.findOne({ email: d.email.toLowerCase() })) throw new HttpError(409, "الإيميل ده مسجل قبل كده");
  const u = await User.create({
    name: d.name, email: d.email, passwordHash: await bcrypt.hash(d.password, 10),
    role: "staff", shop: req.user.shopId,
  });
  audit(req, "create", "team", { name: d.name });
  res.status(201).json({ _id: u.id, name: u.name, email: u.email });
});

router.delete("/:id", async (req, res) => {
  const u = await User.findOneAndDelete({ _id: req.params.id, shop: req.user.shopId, role: "staff" });
  if (!u) throw new HttpError(404, "العامل مش موجود");
  audit(req, "delete", "team", { name: u.name });
  res.status(204).end();
});

export default router;
