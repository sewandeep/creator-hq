import "server-only";
import type { DB } from "@/app/actions/helpers";
import { payeeKey } from "@/lib/finance/auto-categorize";
import { ensureCategories } from "@/lib/finance/categories-server";
import { isSajilo } from "@/lib/finance/categories";
import { suggestPattern } from "@/lib/finance/categorize";
import { addDays, daysBetween, fmtDate, rupees, todayIST } from "@/lib/format";

// Suggestions: things the app notices in your data, each with a one-tap fix.
// Worked out fresh every time (so they disappear once dealt with); ones you
// dismiss or snooze are remembered in suggestion_dismissals.

export type SuggestionAction =
  | { kind: "link_deal"; label: string; txnId: string; dealId: string }
  | { kind: "create_deal"; label: string; txnId: string; brand: string; title: string }
  | { kind: "recat"; label: string; txnIds: string[]; categoryId: string; pattern?: string }
  | { kind: "got_back"; label: string; person: string; amount: number }
  | { kind: "paid_back"; label: string; person: string; amount: number }
  | { kind: "passthrough"; label: string; txnIds: string[]; note: string }
  | { kind: "snooze"; label: string; days: number }
  | { kind: "dismiss"; label: string }
  | { kind: "link"; label: string; href: string }
  | { kind: "ask"; label: string; message: string };

export type Suggestion = {
  key: string;
  type: "income" | "recat" | "duplicate" | "lending" | "subscription" | "spike" | "passthrough";
  icon: string;
  title: string;
  detail: string;
  /** Brand money: the card lets you pick how much TDS was cut. */
  askTds?: boolean;
  actions: SuggestionAction[];
};

type T = {
  id: string;
  txn_date: string;
  amount: number;
  direction: "debit" | "credit";
  description: string;
  counterparty: string | null;
  upi_id: string | null;
  note: string | null;
  person: string | null;
  category_id: string | null;
  category_source: string;
  category_reason: string | null;
  needs_review: boolean;
  payment_id: string | null;
  suggested_invoice_id: string | null;
  source: string;
  matched_txn_id: string | null;
};

const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 4);

export async function loadSuggestions(db: DB, userId: string, opts: { limit?: number } = {}): Promise<Suggestion[]> {
  const today = todayIST();
  const since = addDays(today, -190);
  const [categories, { data: rows }, { data: deals }, { data: dismissed }] = await Promise.all([
    ensureCategories(db),
    db
      .from("transactions")
      .select("id, txn_date, amount, direction, description, counterparty, upi_id, note, person, category_id, category_source, category_reason, needs_review, payment_id, suggested_invoice_id, source, matched_txn_id")
      .eq("user_id", userId)
      .gte("txn_date", since)
      .order("txn_date", { ascending: false })
      .limit(4000),
    db.from("deals").select("id, title, stage, amount, brand:brands(name)").eq("user_id", userId).not("stage", "in", "(paid,lost)").limit(200),
    db.from("suggestion_dismissals").select("key, until").eq("user_id", userId),
  ]);
  const hidden = new Set((dismissed ?? []).filter((d) => !d.until || d.until > today).map((d) => d.key));
  const txns = ((rows ?? []) as T[]).map((t) => ({ ...t, amount: Number(t.amount) })).filter((t) => !(t.source !== "statement" && t.matched_txn_id));
  const cat = new Map(categories.map((c) => [c.id, c]));
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const out: Suggestion[] = [];
  const push = (s: Suggestion) => {
    if (!hidden.has(s.key)) out.push(s);
  };

  // 1. Brand money with no invoice ------------------------------------------
  const creatorIncome = byName.get("creator income");
  for (const t of txns) {
    if (t.direction !== "credit" || t.payment_id || t.suggested_invoice_id || t.amount < 1000 || t.source !== "statement") continue;
    const c = t.category_id ? cat.get(t.category_id) : null;
    const looksLikeCompany = !c && /^(Recd:)?(NEFT|IMPS|RTGS)|Recd:/i.test(t.description);
    if (!(c?.id === creatorIncome?.id || looksLikeCompany)) continue;
    const who = t.counterparty || t.description.split("/").slice(0, 3).join(" ");
    const w = new Set(words(`${who} ${t.description} ${t.note ?? ""}`));
    const matches = (deals ?? [])
      .filter((d) => words(d.brand?.name ?? "").some((x) => w.has(x) || [...w].some((y) => y.startsWith(x.slice(0, 5)))))
      .slice(0, 2);
    push({
      key: `income:${t.id}`,
      type: "income",
      icon: "💸",
      title: `${rupees(t.amount)} from ${title(who)} isn't linked to a deal or invoice`,
      detail: `${fmtDate(t.txn_date)} · Link it so your earnings, invoices and TDS stay right.`,
      askTds: true,
      actions: [
        ...matches.map((d): SuggestionAction => ({ kind: "link_deal", label: `Link to ${d.brand?.name} — ${d.title}`, txnId: t.id, dealId: d.id })),
        { kind: "create_deal", label: matches.length ? "New deal + invoice instead" : "Create deal + invoice (paid)", txnId: t.id, brand: title(who).slice(0, 60), title: t.note ? title(t.note).slice(0, 60) : "" },
        { kind: "dismiss", label: "Not brand money" },
      ],
    });
  }

  // 2. Probably the wrong category (you usually file this payee elsewhere) ---
  const votes = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (!t.category_id || t.needs_review || !["user", "match"].includes(t.category_source)) continue;
    const k = `${payeeKey(t)}|${t.direction}`;
    const m = votes.get(k) ?? new Map<string, number>();
    m.set(t.category_id, (m.get(t.category_id) ?? 0) + 1);
    votes.set(k, m);
  }
  const wrong = new Map<string, { target: string; ids: string[]; from: string; who: string; sample: T }>();
  for (const t of txns) {
    if (!t.category_id || t.needs_review || t.category_source === "user" || t.category_source === "match" || /^Your rule/.test(t.category_reason ?? "")) continue;
    const k = `${payeeKey(t)}|${t.direction}`;
    const m = votes.get(k);
    if (!m) continue;
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [top, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (total < 3 || n / total < 0.8 || top === t.category_id) continue;
    const g = wrong.get(`${k}|${top}`) ?? { target: top, ids: [], from: t.category_id, who: t.counterparty || t.description.slice(0, 30), sample: t };
    g.ids.push(t.id);
    wrong.set(`${k}|${top}`, g);
  }
  for (const [k, g] of wrong) {
    const to = cat.get(g.target);
    const from = cat.get(g.from);
    if (!to) continue;
    push({
      key: `recat:${k}`,
      type: "recat",
      icon: "🏷️",
      title: `${g.ids.length === 1 ? "A payment" : `${g.ids.length} payments`} to ${title(g.who)} ${g.ids.length === 1 ? "is" : "are"} in ${from?.name ?? "another category"}`,
      detail: `You usually put ${title(g.who)} under ${to.emoji ?? ""} ${to.name}.`,
      actions: [
        { kind: "recat", label: `Move to ${to.name}`, txnIds: g.ids, categoryId: to.id, pattern: suggestPattern(g.sample) || undefined },
        { kind: "dismiss", label: "They're right" },
      ],
    });
  }

  // 3. Possible double charges ------------------------------------------------
  const recent = txns.filter((t) => t.direction === "debit" && t.source === "statement" && t.amount >= 50 && t.txn_date >= addDays(today, -60));
  const fees = byName.get("bank fees & charges")?.id;
  const groups = new Map<string, T[]>();
  for (const t of recent) {
    if (t.category_id && (t.category_id === fees || cat.get(t.category_id)?.kind === "transfer")) continue;
    const k = `${payeeKey(t)}|${t.amount.toFixed(2)}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.txn_date.localeCompare(b.txn_date));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (daysBetween(a.txn_date, b.txn_date) > 1) continue;
      push({
        key: `dup:${a.id}:${b.id}`,
        type: "duplicate",
        icon: "👯",
        title: `Charged twice? ${rupees(b.amount)} to ${title(b.counterparty || b.description.slice(0, 30))}`,
        detail: `On ${fmtDate(a.txn_date)}${a.txn_date !== b.txn_date ? ` and ${fmtDate(b.txn_date)}` : " — twice the same day"}. If you only bought once, ask them for a refund.`,
        actions: [
          { kind: "dismiss", label: "It's fine" },
          { kind: "ask", label: "Ask AI", message: `I was charged ${rupees(b.amount)} by ${b.counterparty ?? b.description} on ${a.txn_date} and ${b.txn_date}. Is this a double charge, and what should I do?` },
        ],
      });
      break;
    }
  }

  // 4. Money lent and not back yet (30+ days) ---------------------------------
  const lendCats = new Set(categories.filter((c) => c.kind === "lending").map((c) => c.id));
  const people = new Map<string, { owed: number; lastLent: string }>();
  for (const t of [...txns].reverse()) {
    if (!t.category_id || !lendCats.has(t.category_id)) continue;
    const p = t.person?.trim();
    if (!p) continue;
    const r = people.get(p) ?? { owed: 0, lastLent: t.txn_date };
    r.owed += t.direction === "debit" ? t.amount : -t.amount;
    if (t.direction === "debit") r.lastLent = t.txn_date;
    people.set(p, r);
  }
  for (const [person, r] of people) {
    const days = daysBetween(r.lastLent, today);
    if (r.owed >= 1 && days >= 30) {
      push({
        key: `lend:${person.toLowerCase()}:${r.lastLent}`,
        type: "lending",
        icon: "🤝",
        title: `${person} still owes you ${rupees(r.owed)}`,
        detail: `Last lent ${days} days ago (${fmtDate(r.lastLent)}).`,
        actions: [
          { kind: "got_back", label: "Got it back", person, amount: Math.round(r.owed * 100) / 100 },
          { kind: "snooze", label: "Remind me next week", days: 7 },
        ],
      });
    } else if (r.owed <= -1) {
      push({
        key: `owe:${person.toLowerCase()}:${Math.round(-r.owed)}`,
        type: "lending",
        icon: "🙏",
        title: `You owe ${person} ${rupees(-r.owed)}`,
        detail: "From money you borrowed. Paid it back in cash or another account? Mark it here.",
        actions: [
          { kind: "paid_back", label: "I've paid it back", person, amount: Math.round(-r.owed * 100) / 100 },
          { kind: "snooze", label: "Remind me next week", days: 7 },
        ],
      });
    }
  }

  // 5. Monthly payments hiding outside Subscriptions --------------------------
  const subs = byName.get("subscriptions");
  const skipNames = new Set(["subscriptions", "phone & internet", "emi & loans", "investments", "rent", "insurance", "bills & utilities", "self transfer", "bank fees & charges", "cash withdrawal", "credit card bill"]);
  const byPayee = new Map<string, T[]>();
  for (const t of txns) {
    if (t.direction !== "debit" || t.amount < 49) continue;
    const c = t.category_id ? cat.get(t.category_id) : null;
    if (c && (skipNames.has(c.name.toLowerCase()) || c.kind === "lending" || isSajilo(c.name))) continue;
    const k = payeeKey(t);
    if (k.length < 3) continue;
    byPayee.set(k, [...(byPayee.get(k) ?? []), t]);
  }
  if (subs) {
    for (const [k, list] of byPayee) {
      const months = new Set(list.map((t) => t.txn_date.slice(0, 7)));
      if (months.size < 3 || list.length > months.size + 1) continue;
      const amounts = list.map((t) => t.amount).sort((a, b) => a - b);
      if (amounts[amounts.length - 1] / amounts[0] > 1.15) continue;
      const per = amounts[Math.floor(amounts.length / 2)];
      const who = title(list[0].counterparty || list[0].description.slice(0, 30));
      push({
        key: `sub:${k}`,
        type: "subscription",
        icon: "🔁",
        title: `Looks like a monthly payment: ${who} ${rupees(per)}`,
        detail: `${months.size} months in a row — about ${rupees(per * 12)} a year. Still using it?`,
        actions: [
          { kind: "recat", label: "Put under Subscriptions", txnIds: list.map((t) => t.id), categoryId: subs.id, pattern: suggestPattern(list[0]) || undefined },
          { kind: "dismiss", label: "Not a subscription" },
        ],
      });
    }
  }

  // 6. A category much higher than usual this month ---------------------------
  const ym = today.slice(0, 7);
  const prev = [1, 2, 3].map((n) => {
    const d = new Date(`${ym}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.toISOString().slice(0, 7);
  });
  const spend = new Map<string, Map<string, number>>();
  for (const t of txns) {
    const c = t.category_id ? cat.get(t.category_id) : null;
    if (!c || c.kind !== "expense" || isSajilo(c.name) || t.direction !== "debit") continue;
    const m = t.txn_date.slice(0, 7);
    const per = spend.get(c.id) ?? new Map<string, number>();
    per.set(m, (per.get(m) ?? 0) + t.amount);
    spend.set(c.id, per);
  }
  for (const [cid, per] of spend) {
    const now = per.get(ym) ?? 0;
    const avg = prev.reduce((s, m) => s + (per.get(m) ?? 0), 0) / 3;
    if (avg < 500 || now < avg * 1.5 || now - avg < 2000) continue;
    const c = cat.get(cid)!;
    push({
      key: `spike:${ym}:${cid}`,
      type: "spike",
      icon: "📈",
      title: `${c.emoji ?? ""} ${c.name}: ${rupees(now)} this month`,
      detail: `About ${rupees(now - avg)} more than your usual ${rupees(avg)}.`,
      actions: [
        { kind: "link", label: "See them", href: `/money/transactions?month=${ym}&category=${cid}` },
        { kind: "dismiss", label: "OK" },
      ],
    });
  }

  // 7. Money that came in only to go out again ---------------------------------
  const settled = (t: T) => {
    const c = t.category_id ? cat.get(t.category_id) : null;
    return t.category_source === "user" || t.payment_id || (c && (c.kind === "passthrough" || c.kind === "transfer" || isSajilo(c.name)));
  };
  const ins = txns.filter((t) => t.direction === "credit" && t.amount >= 1000 && t.source === "statement" && !settled(t));
  // Payments already sorted as ordinary spending (bills, fuel, shopping…) are never "passing through".
  const spendingSorted = (t: T) => {
    const c = t.category_id ? cat.get(t.category_id) : null;
    return Boolean(c && c.kind !== "lending" && c.kind !== "family" && t.category_source !== "ai" && t.category_source !== "none");
  };
  const outs = txns.filter((t) => t.direction === "debit" && t.source === "statement" && !settled(t) && !spendingSorted(t));
  const used = new Set<string>();
  const near = (a: string, b: string, days: number) => Math.abs(daysBetween(a, b)) <= days;
  for (const inc of ins) {
    let match: T[] | null = null;
    const same = outs.find((o) => !used.has(o.id) && Math.abs(o.amount - inc.amount) <= 1 && near(o.txn_date, inc.txn_date, 4));
    if (same) match = [same];
    else {
      // Split across two or three payments out within a week — all to the same person.
      const pool = outs.filter((o) => !used.has(o.id) && o.amount >= inc.amount * 0.1 && o.amount < inc.amount && o.txn_date >= inc.txn_date && near(o.txn_date, inc.txn_date, 7)).slice(0, 12);
      const samePerson = (xs: T[]) => new Set(xs.map((x) => payeeKey(x))).size === 1;
      outer: for (let i = 0; i < pool.length; i++)
        for (let j = i + 1; j < pool.length; j++) {
          if (Math.abs(pool[i].amount + pool[j].amount - inc.amount) <= 1 && samePerson([pool[i], pool[j]])) {
            match = [pool[i], pool[j]];
            break outer;
          }
          for (let k = j + 1; k < pool.length; k++)
            if (Math.abs(pool[i].amount + pool[j].amount + pool[k].amount - inc.amount) <= 1 && samePerson([pool[i], pool[j], pool[k]])) {
              match = [pool[i], pool[j], pool[k]];
              break outer;
            }
        }
    }
    if (!match) continue;
    match.forEach((m) => used.add(m.id));
    const from = title(inc.counterparty || inc.description.slice(0, 30));
    const to = [...new Set(match.map((m) => title(m.counterparty || m.description.slice(0, 30))))].join(", ");
    push({
      key: `pt:${inc.id}`,
      type: "passthrough",
      icon: "🔀",
      title: `${rupees(inc.amount)} came in from ${from} and went out to ${to}`,
      detail: `${fmtDate(inc.txn_date)}${match.length > 1 ? ` · sent on in ${match.length} payments` : ""}. Just passing through? Then it won't count as income or spending.`,
      actions: [
        { kind: "passthrough", label: "Yes, passing through", txnIds: [inc.id, ...match.map((m) => m.id)], note: `Passed through: from ${from} to ${to}` },
        { kind: "dismiss", label: "No, they're separate" },
      ],
    });
  }

  return out.slice(0, opts.limit ?? 50);
}
