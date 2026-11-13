import { AuditLog } from "../models/AuditLog.js";

// سجل التعديلات: مين عمل إيه ومتى. بنسجل من غير ما نوقّف الطلب لو فشل.
export const audit = (req, action, entity, details = {}) =>
  AuditLog.create({ shop: req.user.shopId, user: req.user.id, userName: req.user.name, action, entity, details })
    .catch((e) => console.error("audit failed", e.message));
