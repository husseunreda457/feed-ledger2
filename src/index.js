import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { connectDB } from "./config/db.js";
import { auth, writable, ownerOnly, adminOnly } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import authRoutes from "./routes/auth.js";
import customerRoutes from "./routes/customers.js";
import productRoutes from "./routes/products.js";
import transactionRoutes from "./routes/transactions.js";
import summaryRoutes from "./routes/summary.js";
import teamRoutes from "./routes/team.js";
import adminRoutes from "./routes/admin.js";
import exportRoutes from "./routes/export.js";
import auditRoutes from "./routes/audit.js";
import supplierRoutes from "./routes/suppliers.js";

const app = express();
app.set("trust proxy", 1); // ورا Render/Vercel
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }), authRoutes);
app.use("/api/customers", auth, writable, customerRoutes);
app.use("/api/products", auth, writable, productRoutes);
app.use("/api/transactions", auth, writable, transactionRoutes);
app.use("/api/summary", auth, summaryRoutes);
app.use("/api/team", auth, writable, ownerOnly, teamRoutes);
app.use("/api/suppliers", auth, writable, ownerOnly, supplierRoutes);
app.use("/api/export", auth, ownerOnly, exportRoutes);
app.use("/api/audit", auth, ownerOnly, auditRoutes);
app.use("/api/admin", auth, adminOnly, adminRoutes);

app.use(errorHandler);

await connectDB();
app.listen(process.env.PORT || 5000, () => console.log("Server running"));
