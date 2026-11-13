import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { User } from "../models/User.js";
import { HttpError } from "../lib/http.js";
import { auth } from "../middleware/auth.js";
import { subscriptionStatus } from "../lib/ledger.js";
import { sendMail } from "../lib/mail.js";

const router = Router();
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const cookieOpts = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 3600 * 1000,
};

async function payload(u) {
  const shop = u.role === "staff" ? await User.findById(u.shop) : u;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    shopName: shop?.shopName || "",
    sub: subscriptionStatus(shop || u),
  };
}
async function startSession(res, user, status = 200) {
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  res
    .cookie("token", token, cookieOpts)
    .status(status)
    .json({ user: await payload(user) });
}

const registerSchema = z.object({
  name: z.string().trim().min(2),
  shopName: z.string().trim().optional().default(""),
  email: z.string().trim().email(),
  password: z.string().min(8, "الباسورد 8 حروف على الأقل"),
});

router.post("/register", async (req, res) => {
  const d = registerSchema.parse(req.body);
  if (await User.findOne({ email: d.email.toLowerCase() }))
    throw new HttpError(409, "الإيميل ده مسجل قبل كده");
  const days = Number(process.env.TRIAL_DAYS || 14);
  const user = await User.create({
    name: d.name,
    shopName: d.shopName,
    email: d.email,
    passwordHash: await bcrypt.hash(d.password, 10),
    role: "owner",
    trialEndsAt: new Date(Date.now() + days * 864e5),
  });
  await startSession(res, user, 201);
});

router.post("/login", async (req, res) => {
  const d = z
    .object({ email: z.string().email(), password: z.string() })
    .parse(req.body);
  const user = await User.findOne({ email: d.email.toLowerCase() });
  if (
    !user ||
    user.disabled ||
    !(await bcrypt.compare(d.password, user.passwordHash))
  ) {
    throw new HttpError(401, "الإيميل أو الباسورد غلط");
  }
  await startSession(res, user);
});

router.post("/logout", (req, res) => {
  res
    .clearCookie("token", { ...cookieOpts, maxAge: undefined })
    .json({ ok: true });
});

router.get("/me", auth, async (req, res) => {
  res.json({ user: await payload(await User.findById(req.user.id)) });
});

router.post("/forgot", async (req, res) => {
  try {
    console.log("1️⃣ Received forgot password request for:", req.body);
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    const u = await User.findOne({ email: email.toLowerCase() });
    console.log("2️⃣ User found in database:", u ? "Yes" : "No");

    if (u && !u.disabled) {
      const token = crypto.randomBytes(32).toString("hex");
      u.resetTokenHash = sha(token);
      u.resetExpires = new Date(Date.now() + 3600e3);
      await u.save();
      console.log("3️⃣ Token generated and saved, calling sendMail...");

      await sendMail({
        to: u.email,
        subject: "استرجاع الباسورد",
        text: `ادخل على الرابط ده لتغيير الباسورد (صالح ساعة):\n${process.env.CLIENT_URL}/reset/${token}`,
      });
      console.log("4️⃣ sendMail finished executing.");
    } else {
      console.log("⚠️ User not found or account is disabled.");
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error in /forgot route FULL:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

router.post("/reset", async (req, res) => {
  try {
    const d = z
      .object({
        token: z.string().min(10),
        password: z.string().min(8, "الباسورد 8 حروف على الأقل"),
      })
      .parse(req.body);

    // ندور على اليوزر بالتوكن ونتاكد إنه لسه صالح (لم ينتهي وقته)
    const u = await User.findOne({
      resetTokenHash: sha(d.token),
      resetExpires: { $gt: Date.now() },
    });

    if (!u) {
      return res
        .status(400)
        .json({ message: "رابط غير صالح أو انتهت صلاحيته" });
    }

    // نحدث الباسورد الجديد (تأكد إنك بتعمل تشفير للباسورد هنا زي ما عملت في التسجيل)
    u.password = await bcrypt.hash(d.password, 10);

    // 🔒 خطوة إبطال التوكن (عشان محدش يستخدمه تاني أبداً)
    u.resetTokenHash = undefined;
    u.resetExpires = undefined;

    await u.save();

    res.json({ message: "تم تغيير الباسورد بنجاح" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
export default router;
