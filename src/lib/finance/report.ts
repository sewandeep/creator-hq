import "server-only";
import type { DB } from "@/app/actions/helpers";

export type Txn = {
  id: string;
  source: string;
  txn_date: string;
  description: string;
  amount: number;
  direction: "debit" | "credit";
  counterparty: string | null;
  note: string | null;
  person: string | null;
  is_cash: boolean;
  needs_review: boolean;
  matched_txn_id: string | null;
  account_id: string | null;
  category: { id: string; name: string; kind: string; emoji: string | null; is_business: boolean } | null;
};

const SELECT =
  "id, source, txn_date, description, amount, direction, counterparty, note, person, is_cash, needs_review, matched_txn_id, account_id, category:categories(id, name, kind, emoji, is_business)";

/** All transactions in a date range (pages through results — Supabase returns 1,000 rows at a time). */
export async function loadTxns(supabase: DB, from: string, to: string): Promise<Txn[]> {
  const out: Txn[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("transactions")
      .select(SELECT)
      .gte("txn_date", from)
      .lte("txn_date", to)
      .order("txn_date")
      .order("seq", { nullsFirst: false })
      .range(start, start + 999);
    if (error) throw error;
    out.push(...((data ?? []).map((d) => ({ ...d, amount: Number(d.amount) })) as Txn[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** A typed entry that's been matched to a bank line is shown, but only the bank line counts. */
export const counts = (t: Txn) => !(t.source !== "statement" && t.matched_txn_id);

export type Summary = ReturnType<typeof summarize>;

export function summarize(txns: Txn[]) {
  const live = txns.filter(counts);
  const sum = (xs: Txn[]) => xs.reduce((s, t) => s + t.amount, 0);
  const signed = (t: Txn) => (t.direction === "debit" ? t.amount : -t.amount);

  const byCat = new Map<string, { id: string; name: string; emoji: string | null; kind: string; is_business: boolean; amount: number; count: number }>();
  for (const t of live) {
    const c = t.category ?? { id: "none", name: t.direction === "debit" ? "Not categorised yet" : "Money in, not categorised", kind: t.direction === "debit" ? "expense" : "income", emoji: "❓", is_business: false };
    const key = `${c.id}|${c.id === "none" ? t.direction : ""}`;
    const row = byCat.get(key) ?? { ...c, amount: 0, count: 0 };
    // Spending categories: money out minus refunds into the same category. Income: money in.
    row.amount += c.kind === "income" ? -signed(t) : signed(t);
    row.count++;
    byCat.set(key, row);
  }
  const cats = [...byCat.values()];
  const of = (kind: string) => cats.filter((c) => c.kind === kind);
  const total = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

  const spendingCats = of("expense").filter((c) => c.amount > 0.009).sort((a, b) => b.amount - a.amount);
  const incomeCats = of("income").filter((c) => c.amount > 0.009).sort((a, b) => b.amount - a.amount);

  const payees = new Map<string, { name: string; amount: number; count: number }>();
  for (const t of live.filter((x) => x.direction === "debit" && (x.category?.kind ?? "expense") === "expense")) {
    const name = (t.counterparty || t.note || t.description).trim();
    const key = name.toLowerCase();
    const p = payees.get(key) ?? { name, amount: 0, count: 0 };
    p.amount += t.amount;
    p.count++;
    payees.set(key, p);
  }

  const lending = live.filter((t) => t.category?.kind === "lending");
  const cashWithdrawn = sum(live.filter((t) => t.category?.name === "Cash withdrawal" && t.direction === "debit"));
  const cashLogged = sum(live.filter((t) => t.is_cash && t.direction === "debit"));

  return {
    income: total(incomeCats),
    spent: total(spendingCats),
    invested: total(of("savings")),
    lent: sum(lending.filter((t) => t.direction === "debit")),
    returned: sum(lending.filter((t) => t.direction === "credit")),
    moneyIn: sum(live.filter((t) => t.direction === "credit" && !t.is_cash)),
    moneyOut: sum(live.filter((t) => t.direction === "debit" && !t.is_cash)),
    cashWithdrawn,
    cashLogged,
    business: total(spendingCats.filter((c) => c.is_business)),
    spendingCats,
    incomeCats,
    topPayees: [...payees.values()].sort((a, b) => b.amount - a.amount).slice(0, 8),
    unclear: live.filter((t) => !t.category || t.needs_review),
    count: live.length,
  };
}

export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(ym: string, by: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

export function monthLabel(ym: string, short = false) {
  return new Intl.DateTimeFormat("en-IN", { month: short ? "short" : "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
}
