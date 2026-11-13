import test from "node:test";
import assert from "node:assert/strict";
import { txBalance, makesNegative, exceedsLimit, subscriptionStatus, toCsv, csvCell } from "../src/lib/ledger.js";

test("الرصيد = مجموع (الإجمالي - المدفوع)", () => {
  const txs = [
    { total: 500000, paid: 300000 },        // بيع 5000 دفع 3000
    { total: 0, paid: 50000 },              // دفعة 500
    { total: -30000, paid: 0 },             // مرتجع 300
  ];
  assert.equal(txBalance(txs), 500000 - 300000 - 50000 - 30000);
});

test("منع الحذف لو الحساب هيبقى بالسالب", () => {
  assert.equal(makesNegative(200000, -1000), true);
  assert.equal(makesNegative(200000, 100000), false);
  assert.equal(makesNegative(-5000, -5000), false); // كان سالب أصلاً ومزادش
});

test("الحد الائتماني", () => {
  assert.equal(exceedsLimit(0, 999999, 999999), false); // من غير حد
  assert.equal(exceedsLimit(600000, 200000, 500000), true);
  assert.equal(exceedsLimit(600000, 200000, 300000), false);
});

test("حالة الاشتراك", () => {
  const now = new Date("2026-11-12");
  const day = 864e5;
  assert.equal(subscriptionStatus({ trialEndsAt: new Date(now.getTime() + day) }, now).status, "trial");
  assert.equal(subscriptionStatus({ trialEndsAt: new Date(now.getTime() - day) }, now).status, "expired");
  assert.equal(subscriptionStatus({ trialEndsAt: new Date(now.getTime() - day), paidUntil: new Date(now.getTime() + day) }, now).status, "active");
});

test("CSV: علامات الاقتباس وحماية الصيغ", () => {
  assert.equal(csvCell('علف "تسمين"'), '"علف ""تسمين"""');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell(-300), "-300");
  assert.ok(toCsv(["a"], [["x"]]).startsWith("\uFEFF"));
});

import { packBaseOf, validQty, lineTotal, invoiceTotal } from "../src/lib/ledger.js";

test("شيكارة وكيلو: الإجمالي والتقريب", () => {
  const pb = packBaseOf({ packGrams: 50000 });
  assert.equal(pb, 50000);
  // 4 شيكاير × 1000 ج (بالقروش)
  assert.equal(lineTotal({ mode: "pack", qtyBase: 4 * pb, packBase: pb, unitPrice: 100000 }), 400000);
  // 50 كجم × 20 ج/كجم
  assert.equal(lineTotal({ mode: "kg", qtyBase: 50000, packBase: pb, unitPrice: 2000 }), 100000);
  // 2.5 كجم × 22 ج = 55 ج بالظبط
  assert.equal(lineTotal({ mode: "kg", qtyBase: 2500, packBase: pb, unitPrice: 2200 }), 5500);
  // 333 جرام × 13 ج/كجم = 4.329 ج → 433 قرش
  assert.equal(lineTotal({ mode: "kg", qtyBase: 333, packBase: pb, unitPrice: 1300 }), 433);
  assert.equal(invoiceTotal([{ total: 400000 }, { total: 100000 }]), 500000);
});

test("التحقق من الكمية حسب النوع", () => {
  assert.equal(validQty("pack", 100000, 50000, true), true);
  assert.equal(validQty("pack", 75000, 50000, true), false);   // شيكارة ونص مش مسموح
  assert.equal(validQty("kg", 2500, 50000, true), true);
  assert.equal(validQty("kg", 2500, 1, false), false);         // علبة دوا مبتتباعش بالكيلو
  assert.equal(validQty("pack", 3, 1, false), true);           // 3 علب
  assert.equal(validQty("pack", 0, 1, false), false);
});
