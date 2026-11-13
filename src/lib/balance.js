import mongoose from "mongoose";
import { Transaction } from "../models/Transaction.js";

// الرصيد = مجموع (الإجمالي - المدفوع). بالقروش.
// بيرجّع Map: customerId => balance
export async function balances(owner, customerId) {
  const match = { owner: new mongoose.Types.ObjectId(owner) };
  if (customerId) match.customer = new mongoose.Types.ObjectId(customerId);
  const rows = await Transaction.aggregate([
    { $match: match },
    { $group: { _id: "$customer", balance: { $sum: { $subtract: ["$total", "$paid"] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.balance]));
}
