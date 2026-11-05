import "server-only";
import type { DB } from "@/app/actions/helpers";
import { isSajilo } from "./categories";

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
  pair_id?: string | null;
  category: { id: string; name: string; kind: string; emoji: string | null; is_business: boolean; stream?: string | null } | null;
};

const SELECT =
  "id, source, txn_date, description, amount, direction, counterparty, note, person, is_cash, needs_review, matched_txn_id, account_id, pair_id, category:categories(id, name, kind, emoji, is_business, stream)";

/** All transactions in a date range (pages through results — Supabase returns 1,000 rows at a time). */
export async function loadTxns(supabase: DB, from: string, to: string, userId?: string): Promise<Txn[]> {
  const out: Txn[] = [];
  for (let start = 0; ; start += 1000) {
    let q = supabase.from("transactions").select(SELECT);
    // Logged-in pages are already limited to your rows; the bot's client passes your id.
    if (userId) q = q.eq("user_id", userId);
    const { data, error } = await q
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
  const kindOf = (t: Txn) => t.category?.kind ?? null;

  // Spending and income, per category. Only spending/income kinds count here —
  // family, lending, transfers, savings and pass-through each have their own line.
  const byCat = new Map<string, { id: string; name: string; emoji: string | null; kind: string; is_business: boolean; stream: string | null; amount: number; count: number }>();
  for (const t of live) {
    const kind = kindOf(t);
    if (kind && kind !== "expense" && kind !== "income") continue;
    const c = t.category ?? { id: "none", name: t.direction === "debit" ? "Not categorised yet" : "Money in, not categorised", kind: t.direction === "debit" ? "expense" : "income", emoji: "❓", is_business: false, stream: null };
    const key = `${c.id}|${c.id === "none" ? t.direction : ""}`;
    const row = byCat.get(key) ?? { ...c, stream: c.stream ?? null, amount: 0, count: 0 };
    row.amount += c.kind === "income" ? -signed(t) : signed(t);
    row.count++;
    byCat.set(key, row);
  }
  const cats = [...byCat.values()];
  const of = (kind: string) => cats.filter((c) => c.kind === kind);
  const total = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

  const personal = (c: { name: string; stream?: string | null }) => !isSajilo(c.name) && c.stream !== "sajilo";
  const spendingCats = of("expense").filter((c) => personal(c) && c.amount > 0.009).sort((a, b) => b.amount - a.amount);
  const incomeCats = of("income").filter((c) => personal(c) && c.amount > 0.009).sort((a, b) => b.amount - a.amount);
  const sajiloCats = cats.filter((c) => !personal(c) && Math.abs(c.amount) > 0.009).sort((a, b) => b.amount - a.amount);
  const sajiloIn = total(sajiloCats.filter((c) => c.kind === "income"));
  const sajiloOut = total(sajiloCats.filter((c) => c.kind !== "income"));

  // Income by stream (uncategorised money in counts under "other" until sorted).
  const streams = { creator: 0, freelance: 0, other: 0 };
  for (const c of incomeCats) {
    const k = c.stream === "creator" || c.stream === "freelance" ? c.stream : "other";
    streams[k] += c.amount;
  }

  const payees = new Map<string, { name: string; amount: number; count: number }>();
  for (const t of live.filter((x) => x.direction === "debit" && (kindOf(x) ?? "expense") === "expense" && !isSajilo(x.category?.name))) {
    const name = (t.counterparty || t.note || t.description).trim();
    const key = name.toLowerCase();
    const p = payees.get(key) ?? { name, amount: 0, count: 0 };
    p.amount += t.amount;
    p.count++;
    payees.set(key, p);
  }

  // Family: given and received, per person — its own bucket.
  const familyRows = live.filter((t) => kindOf(t) === "family");
  const familyPeople = new Map<string, { name: string; gave: number; got: number }>();
  for (const t of familyRows) {
    const name = t.person?.trim() || "Family";
    const p = familyPeople.get(name.toLowerCase()) ?? { name, gave: 0, got: 0 };
    if (t.direction === "debit") p.gave += t.amount;
    else p.got += t.amount;
    familyPeople.set(name.toLowerCase(), p);
  }

  // Lending & borrowing: money out to a person adds to what they owe you
  // (lent, or paying back what you borrowed); money in takes it away.
  const lending = live.filter((t) => kindOf(t) === "lending");
  const people = new Map<string, number>();
  for (const t of lending) {
    const n = t.person?.trim() || "Not named yet";
    people.set(n, (people.get(n) ?? 0) + signed(t));
  }

  const pass = live.filter((t) => kindOf(t) === "passthrough");
  const cashWithdrawn = sum(live.filter((t) => t.category?.name === "Cash withdrawal" && t.direction === "debit"));
  const cashLogged = sum(live.filter((t) => t.is_cash && t.direction === "debit"));

  return {
    income: total(incomeCats),
    spent: total(spendingCats),
    invested: sum(live.filter((t) => kindOf(t) === "savings" && t.direction === "debit")) - sum(live.filter((t) => kindOf(t) === "savings" && t.direction === "credit")),
    lent: sum(lending.filter((t) => t.direction === "debit")),
    returned: sum(lending.filter((t) => t.direction === "credit")),
    /** Per person: positive = they owe you, negative = you owe them (this period's entries). */
    lendingPeople: [...people.entries()].map(([name, balance]) => ({ name, balance })).filter((p) => Math.abs(p.balance) > 0.5),
    moneyIn: sum(live.filter((t) => t.direction === "credit" && !t.is_cash)),
    moneyOut: sum(live.filter((t) => t.direction === "debit" && !t.is_cash)),
    cashWithdrawn,
    cashLogged,
    business: total(spendingCats.filter((c) => c.is_business)),
    spendingCats,
    incomeCats,
    streams,
    family: { gave: sum(familyRows.filter((t) => t.direction === "debit")), got: sum(familyRows.filter((t) => t.direction === "credit")), people: [...familyPeople.values()] },
    passThrough: { in: sum(pass.filter((t) => t.direction === "credit")), out: sum(pass.filter((t) => t.direction === "debit")), count: pass.length },
    sajilo: { in: sajiloIn, out: sajiloOut, net: sajiloIn - sajiloOut, cats: sajiloCats },
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
