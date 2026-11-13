import { Router } from "express";
import mongoose from "mongoose";
import { AuditLog } from "../models/AuditLog.js";

const router = Router();

router.get("/", async (req, res) => {
  res.json(await AuditLog.find({ shop: new mongoose.Types.ObjectId(req.user.shopId) }).sort({ at: -1 }).limit(200).lean());
});

export default router;
