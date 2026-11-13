import jwt from "jsonwebtoken";
import { HttpError } from "../lib/http.js";
import { User } from "../models/User.js";
import { subscriptionStatus } from "../lib/ledger.js";

// التوكن في Cookie من نوع httpOnly (الجافاسكريبت في الصفحة مبتقدرش تقراه)
export async function auth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) throw new HttpError(401, "لازم تسجل دخول");
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, "الجلسة انتهت، سجل دخول تاني");
  }
  const user = await User.findById(payload.id);
  if (!user || user.disabled) throw new HttpError(401, "الحساب غير متاح");
  const shopOwner = user.role === "staff" ? await User.findById(user.shop) : user;
  if (!shopOwner || shopOwner.disabled) throw new HttpError(401, "الحساب غير متاح");
  req.user = {
    id: user.id,
    name: user.name,
    role: user.role,
    shopId: String(shopOwner._id), // كل بيانات المحل بتتفلتر بيه
    sub: subscriptionStatus(shopOwner),
  };
  next();
}

// لما الاشتراك ينتهي: القراءة والتصدير شغالين، والكتابة متوقفة
export function writable(req, res, next) {
  if (req.user.role !== "admin" && req.user.sub.status === "expired" && !["GET", "HEAD"].includes(req.method)) {
    throw new HttpError(402, "انتهى الاشتراك. بياناتك متاحة للقراءة والتصدير بس لحد ما تجدد.", "EXPIRED");
  }
  next();
}

export function ownerOnly(req, res, next) {
  if (req.user.role === "staff") throw new HttpError(403, "الصلاحية دي لصاحب المحل بس");
  next();
}

export function adminOnly(req, res, next) {
  if (req.user.role !== "admin") throw new HttpError(403, "مش مسموح");
  next();
}
