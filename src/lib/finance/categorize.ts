import "server-only";
import type { DB } from "@/app/actions/helpers";
import { addDays, rupees } from "@/lib/format";
import { round2 } from "@/lib/money";

export type Rule = { id: string; pattern: string; direction: string | null; category_id: string; hits: number };

export async function loadRules(supabase: DB): Promise<Rule[]> {
  const { data } = await supabase.from("category_rules").select("id, pattern, direction, category_id, hits");
  // Longer (more specific) patterns win.
  return (data ?? []).sort((a, b) => b.pattern.length - a.pattern.length);
}

export function matchText(t: { counterparty?: string | null; upi_id?: string | null; description: string; note?: string | null }) {
  return [t.counterparty, t.upi_id, t.description, t.note].filter(Boolean).join(" ").toLowerCase();
}

export function findRule(rules: Rule[], text: string, direction: string) {
  return rules.find((r) => (!r.direction || r.direction === direction) && text.includes(r.pattern.toLowerCase())) ?? null;
}

/** A sensible "remember this payee" pattern: the UPI id if there is one, else the payee name. */
export function suggestPattern(t: { counterparty: string | null; upi_id: string | null; description: string }) {
  if (t.upi_id && t.upi_id.includes("@")) return t.upi_id.toLowerCase();
  const name = (t.counterparty ?? "").trim().toLowerCase();
  // Needs real letters — never build a rule from just numbers like "26-27".
  const letters = name.replace(/[^a-z]/g, "").length;
  if (letters >= 3 && !["uncategorized", "unknown", "upi", "neft", "imps"].includes(name)) return name;
  // Fall back to the words in the narration (no numbers, no bank codes).
  const words = t.description
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !["upi", "neft", "imps", "rtgs", "payment", "from", "transfer", "inv"].includes(w));
  return words.slice(0, 3).join(" ").slice(0, 40);
}

export type ManualEntry = {
  id: string;
  txn_date: string;
  amount: number;
  direction: string;
  description: string;
  note: string | null;
  person: string | null;
  category_id: string | null;
};

/** Your typed entries (web / Telegram) that haven't been matched to a bank line yet. */
export async function loadUnmatchedManual(supabase: DB, from: string, to: string): Promise<ManualEntry[]> {
  const { data } = await supabase
    .from("transactions")
    .select("id, txn_date, amount, direction, description, note, person, category_id")
    .in("source", ["manual", "telegram"])
    .is("matched_txn_id", null)
    .eq("is_cash", false)
    .gte("txn_date", addDays(from, -5))
    .lte("txn_date", addDays(to, 3));
  return (data ?? []).map((d) => ({ ...d, amount: Number(d.amount) }));
}

/** A bank line on `bankDate` matches a typed entry of the same amount from up to 2 days after / 5 days before. */
export function findManualMatch(entries: ManualEntry[], bank: { txn_date: string; amount: number; direction: string }, taken: Set<string>) {
  const lo = addDays(bank.txn_date, -5);
  const hi = addDays(bank.txn_date, 2);
  const candidates = entries.filter(
    (e) => !taken.has(e.id) && e.direction === bank.direction && Math.abs(e.amount - bank.amount) < 0.01 && e.txn_date >= lo && e.txn_date <= hi,
  );
  candidates.sort(
    (a, b) =>
      Math.abs(new Date(a.txn_date).getTime() - new Date(bank.txn_date).getTime()) -
      Math.abs(new Date(b.txn_date).getTime() - new Date(bank.txn_date).getTime()),
  );
  return candidates[0] ?? null;
}

export type OpenInvoice = { id: string; invoice_number: string; balance: number; expectedNet: number; brand: string };

export async function loadOpenInvoices(supabase: DB): Promise<OpenInvoice[]> {
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number, subtotal, tds_rate, brand:brands(name), payments(gross_amount)")
    .in("status", ["sent", "partially_paid", "draft"]);
  return (data ?? []).map((i) => {
    const balance = round2(Number(i.subtotal) - i.payments.reduce((t, p) => t + Number(p.gross_amount), 0));
    return { id: i.id, invoice_number: i.invoice_number, balance, expectedNet: round2(balance - (balance * Number(i.tds_rate ?? 0)) / 100), brand: i.brand?.name ?? "" };
  });
}

/** Money in that looks like a brand paying an invoice (after TDS, or in full). */
export function findInvoiceMatch(invoices: OpenInvoice[], credit: { amount: number; text: string }) {
  const byAmount = invoices.filter((i) => i.balance > 0 && (Math.abs(i.expectedNet - credit.amount) <= 1 || Math.abs(i.balance - credit.amount) <= 1));
  if (byAmount.length === 1) return byAmount[0];
  const byName = byAmount.find((i) => i.brand && credit.text.includes(i.brand.toLowerCase()));
  return byName ?? byAmount[0] ?? null;
}

export function matchReason(entry: ManualEntry) {
  return `Matched your entry "${entry.description}" from ${entry.txn_date} (${rupees(entry.amount)})`;
}
