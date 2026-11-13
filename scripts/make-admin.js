// الاستخدام: npm run make-admin -- you@example.com
import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../src/models/User.js";

const email = process.argv[2];
if (!email) { console.error("اكتب الإيميل: npm run make-admin -- you@example.com"); process.exit(1); }
await mongoose.connect(process.env.MONGODB_URI);
const u = await User.findOneAndUpdate({ email: email.toLowerCase() }, { role: "admin" });
console.log(u ? `${email} بقى أدمن` : "الإيميل مش موجود. سجّل الحساب الأول من الواجهة.");
await mongoose.disconnect();
