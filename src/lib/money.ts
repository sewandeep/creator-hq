// Invoices, payments and TDS — shared labels and helpers.

export const INVOICE_STATUSES = [
  { id: "draft", label: "Draft", color: "bg-slate-100 text-slate-700" },
  { id: "sent", label: "Sent", color: "bg-sky-100 text-sky-800" },
  { id: "partially_paid", label: "Part paid", color: "bg-amber-100 text-amber-800" },
  { id: "paid", label: "Paid", color: "bg-emerald-100 text-emerald-800" },
  { id: "cancelled", label: "Cancelled", color: "bg-rose-100 text-rose-700" },
] as const;

export function invoiceStatus(id: string) {
  return INVOICE_STATUSES.find((s) => s.id === id) ?? INVOICE_STATUSES[0];
}

export const TDS_SECTIONS = [
  { id: "194J", label: "194J — Professional / technical fees" },
  { id: "194C", label: "194C — Contract work" },
  { id: "194R", label: "194R — Benefits / barter products" },
  { id: "194O", label: "194O — E-commerce platform" },
  { id: "194H", label: "194H — Commission" },
  { id: "other", label: "Other" },
] as const;

export const PAYMENT_MODES = ["Bank transfer", "UPI", "Cheque", "Cash", "Other"];

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** "26-27" for FY 2026-27 */
export function fyShort(startYear: number) {
  return `${String(startYear % 100).padStart(2, "0")}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function formatInvoiceNumber(prefix: string, fy: number, seq: number) {
  const p = prefix.trim().replace(/\/+$/, "");
  return `${p ? `${p}/` : ""}${fyShort(fy)}/${String(seq).padStart(3, "0")}`;
}

/** An unpaid invoice past its due date. */
export function isOverdue(inv: { status: string; due_date: string | null }, today: string) {
  return ["sent", "partially_paid"].includes(inv.status) && !!inv.due_date && inv.due_date < today;
}

// ---------------------------------------------------------------------------
// Amount in words, Indian numbering (lakh / crore)
// ---------------------------------------------------------------------------
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}

export function rupeesInWords(amount: number) {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore >= 100 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  let words = `Rupees ${parts.join(" ") || "Zero"}`;
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}
