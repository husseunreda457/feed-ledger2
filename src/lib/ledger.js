// دوال حسابية بحتة (من غير قاعدة بيانات) عشان نقدر نختبرها بسهولة. كل المبالغ بالقروش.

export const txBalance = (txs) => txs.reduce((s, t) => s + t.total - t.paid, 0);

// الحذف أو التعديل مينفعش يخلّي الحساب بالسالب (لو مكنش سالب قبلها)
export const makesNegative = (before, after) => after < 0 && after < before;

// limit = 0 معناه من غير حد
export const exceedsLimit = (limit, balance, rest) => limit > 0 && balance + rest > limit;

export function subscriptionStatus(u, now = new Date()) {
  if (u.paidUntil && u.paidUntil > now) return { status: "active", until: u.paidUntil };
  if (u.trialEndsAt && u.trialEndsAt > now) return { status: "trial", until: u.trialEndsAt };
  return { status: "expired", until: u.paidUntil || u.trialEndsAt || null };
}

// تصدير CSV: حماية من CSV injection (خلايا بتبدأ بـ = + - @)
export function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (headers, rows) =>
  "\uFEFF" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

// ---------- الوحدات: شيكارة وكيلو ----------
// حجم الشيكارة بالوحدة الأساسية (جرام للأصناف الموزونة، 1 للأصناف بالقطعة)
export const packBaseOf = (p) => (p.packGrams > 0 ? p.packGrams : 1);

// mode "pack": qtyBase لازم يكون مضاعف لحجم الشيكارة. mode "kg": qtyBase بالجرام وللأصناف الموزونة بس.
export function validQty(mode, qtyBase, packBase, weighed) {
  if (!Number.isInteger(qtyBase) || qtyBase <= 0) return false;
  return mode === "pack" ? qtyBase % packBase === 0 : weighed;
}

// إجمالي سطر: بالشيكارة = عدد الشيكاير × سعر الشيكارة، وبالكيلو = (جرامات × سعر الكيلو) / 1000 بتقريب لأقرب قرش
export function lineTotal({ mode, qtyBase, packBase, unitPrice }) {
  return mode === "pack" ? (qtyBase / packBase) * unitPrice : Math.round((qtyBase * unitPrice) / 1000);
}
export const invoiceTotal = (items) => items.reduce((s, i) => s + i.total, 0);
