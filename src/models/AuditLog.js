import mongoose from "mongoose";

const auditSchema = new mongoose.Schema({
  shop: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId },
  userName: String,
  action: { type: String, required: true }, // create | edit | delete | import
  entity: { type: String, required: true }, // sale | payment | return | customer | product | team
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  at: { type: Date, default: Date.now },
});

export const AuditLog = mongoose.model("AuditLog", auditSchema);
