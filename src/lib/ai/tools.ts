import "server-only";
import type { DB } from "@/app/actions/helpers";
import { DONE_STAGES, STAGE_IDS, stageInfo } from "@/lib/constants";
import { ensureCategories } from "@/lib/finance/categories-server";
import { loadTxns, monthRange, summarize } from "@/lib/finance/report";
import { addDays, daysBetween, rupees, todayIST } from "@/lib/format";
import { fyLabel, fyOf, fyRange } from "@/lib/fy";
import { round2 } from "@/lib/money";
import type { Json } from "@/lib/supabase/database.types";
import type { FileRef } from "./files";

// ---------------------------------------------------------------------------
// Tool declarations (what the AI is allowed to call)
// ---------------------------------------------------------------------------
const S = (description?: string) => ({ type: "STRING", ...(description ? { description } : {}) });
const N = (description?: string) => ({ type: "NUMBER", ...(description ? { description } : {}) });
const I = (description?: string) => ({ type: "INTEGER", ...(description ? { description } : {}) });
const B = (description?: string) => ({ type: "BOOLEAN", ...(description ? { description } : {}) });
const obj = (properties: Record<string, object>, required: string[] = []) => ({ type: "OBJECT", properties, ...(required.length ? { required } : {}) });
const arr = (items: object, description?: string) => ({ type: "ARRAY", items, ...(description ? { description } : {}) });

export const TOOL_DECLARATIONS = [
  // ---- Read: look things up ----
  { name: "get_money_summary", description: "Personal money for one month: income, spending by category, top payees, invested, lending, cash, items to review.", parameters: obj({ month: S("YYYY-MM") }, ["month"]) },
  {
    name: "search_transactions",
    description: "Find bank/typed transactions. Use for questions like 'how much did I spend on Zomato' or before changing categories.",
    parameters: obj({
      from: S("YYYY-MM-DD"),
      to: S("YYYY-MM-DD"),
      text: S("words to match in payee / narration / note / person"),
      category: S("exact category name"),
      direction: S("debit (money out) or credit (money in)"),
      only_needing_review: B(),
      limit: I("max rows, default 40"),
    }, ["from", "to"]),
  },
  { name: "list_deals", description: "Brand deals / leads. Stages: lead, contacted, negotiating, confirmed, in_progress, posted, invoiced, paid, lost.", parameters: obj({ stage: S(), brand: S(), text: S(), limit: I() }) },
  { name: "brand_overview", description: "Everything about one brand: deals, deliverables, invoices, payments, contacts, recent notes, how fast they pay.", parameters: obj({ brand: S("brand name (partial is fine)") }, ["brand"]) },
  { name: "list_invoices", description: "Invoices with balances.", parameters: obj({ status: S("unpaid, overdue, paid or all"), fy: I("financial year start, e.g. 2026 for FY 2026-27") }) },
  { name: "get_earnings", description: "Creator income actually received (payments) between two dates, by brand and by month, with TDS.", parameters: obj({ from: S("YYYY-MM-DD"), to: S("YYYY-MM-DD") }, ["from", "to"]) },
  { name: "get_lending", description: "Who owes the user money (and whom the user owes)." },
  { name: "get_tds", description: "TDS cut by each brand in a financial year vs what 26AS shows.", parameters: obj({ fy: I("financial year start") }) },
  { name: "get_upcoming", description: "Follow-ups due, content deadlines, deal deadlines and unpaid invoices in the next N days (plus anything overdue).", parameters: obj({ days: I() }) },
  { name: "get_rate_stats", description: "What brands paid per piece of content (reel, story, video…), from finished deals, plus the user's own rate card." },
  { name: "list_categories", description: "The user's money categories (names to use when categorising)." },
  { name: "list_bank_accounts", description: "The user's bank accounts and the latest statement uploaded for each." },

  // ---- Propose: changes the user must confirm ----
  {
    name: "propose_new_deal",
    description: "Prepare a new brand deal (or lead) for the user to confirm. Use for brand emails/DMs/briefs.",
    parameters: obj({
      brand: S(),
      title: S("short campaign name"),
      stage: S("lead, contacted, negotiating, confirmed, in_progress, posted, invoiced, paid"),
      amount: N("fee in rupees before TDS"),
      is_barter: B(),
      platform: S(),
      deal_date: S("YYYY-MM-DD"),
      due_date: S("content deadline YYYY-MM-DD"),
      next_follow_up: S("YYYY-MM-DD"),
      contact_name: S(),
      contact_email: S(),
      notes: S("key terms: usage rights, exclusivity, brief points"),
      deliverables: arr(obj({ type: S("Reel, Story, Post, Carousel, YouTube Video, YouTube Short, Integration, Live, UGC, Other"), quantity: I(), due_date: S() }, ["type"])),
    }, ["brand", "title"]),
  },
  {
    name: "propose_deal_update",
    description: "Prepare changes to an existing deal (stage, fee, deadline, follow-up date, a note). Get deal_id from list_deals first.",
    parameters: obj({ deal_id: S(), stage: S(), amount: N(), due_date: S(), next_follow_up: S(), note: S("note to add to the deal timeline") }, ["deal_id"]),
  },
  {
    name: "propose_entries",
    description: "Prepare money entries the user spent/received (from a voice note, receipt photo, UPI screenshot or message).",
    parameters: obj({
      entries: arr(
        obj({
          amount: N(),
          direction: S("debit = spent/lent/paid, credit = received/returned"),
          description: S("what it was, short"),
          date: S("YYYY-MM-DD"),
          category: S("exact category name from list_categories"),
          person: S("for lending"),
          is_cash: B(),
        }, ["amount", "direction", "description"]),
      ),
    }, ["entries"]),
  },
  {
    name: "propose_recategorize",
    description: "Prepare changing the category of transactions (ids from search_transactions). remember_pattern makes a rule for future ones.",
    parameters: obj({ transaction_ids: arr(S()), category: S("exact category name"), remember_pattern: S("payee text to always map to this category"), person: S("for lending categories") }, ["transaction_ids", "category"]),
  },
  { name: "propose_invoice_draft", description: "Prepare a draft invoice for a deal (uses the deal's fee and deliverables).", parameters: obj({ deal_id: S() }, ["deal_id"]) },
  {
    name: "propose_statement_import",
    description: "Prepare reading an attached bank statement PDF into an account (account_id from list_bank_accounts).",
    parameters: obj({ file_id: S("e.g. f1"), account_id: S() }, ["file_id", "account_id"]),
  },
  {
    name: "propose_tds_from_26as",
    description: "Prepare saving TDS figures from an attached Form 26AS / AIS (Part I: deductor name, TAN, total amount paid, total tax deducted).",
    parameters: obj({ fy: I("financial year start, e.g. 2025 for FY 2025-26 / AY 2026-27"), entries: arr(obj({ deductor: S(), tan: S(), tds: N(), amount: N() }, ["deductor", "tds"])) }, ["fy", "entries"]),
  },
  {
    name: "propose_past_work_import",
    description: "Prepare importing a list of past brand collaborations (e.g. from a spreadsheet).",
    parameters: obj({
      rows: arr(obj({ brand: S(), title: S(), date: S("YYYY-MM-DD"), deliverables: S("e.g. '1 reel + 2 stories'"), amount: N(), platform: S(), status: S("paid, invoiced, posted…"), contact_name: S(), contact_email: S(), link: S(), notes: S() }, ["brand"])),
    }, ["rows"]),
  },
  {
    name: "propose_attach_to_deal",
    description: "Prepare attaching an uploaded brief/contract file to a deal.",
    parameters: obj({ deal_id: S(), file_id: S(), kind: S("brief, contract or other") }, ["deal_id", "file_id"]),
  },
];

// ---------------------------------------------------------------------------
// Running tools
// ---------------------------------------------------------------------------
export type ToolContext = { db: DB; userId: string; files: FileRef[]; channel: string; proposals: { id: string; kind: string; summary: string }[] };
type Args = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(/[₹,]/g, ""))) ? Number(v.replace(/[₹,]/g, "")) : null);
const isoDate = (v: unknown) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const uuid = (v: unknown) => {
  const s = str(v);
  return s && /^[0-9a-f-]{36}$/.test(s) ? s : null;
};

export async function runTool(name: string, args: Args, ctx: ToolContext): Promise<Record<string, unknown>> {
  try {
    const fn = TOOLS[name];
    if (!fn) return { error: `Unknown tool ${name}` };
    return await fn(args, ctx);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const TOOLS: Record<string, (a: Args, c: ToolContext) => Promise<Record<string, unknown>>> = {
  async get_money_summary(a, { db, userId }) {
    const ym = str(a.month)?.slice(0, 7) ?? todayIST().slice(0, 7);
    const { from, to } = monthRange(ym);
    const s = summarize(await loadTxns(db, from, to, userId));
    return {
      month: ym,
      income: round2(s.income),
      spent: round2(s.spent),
      invested: round2(s.invested),
      left_over: round2(s.income - s.spent - s.invested),
      spending_by_category: s.spendingCats.map((c) => ({ category: c.name, amount: round2(c.amount), count: c.count })),
      income_by_category: s.incomeCats.map((c) => ({ category: c.name, amount: round2(c.amount) })),
      top_payees: s.topPayees.map((p) => ({ payee: p.name, amount: round2(p.amount), times: p.count })),
      lent: s.lent,
      got_back: s.returned,
      cash_withdrawn: s.cashWithdrawn,
      cash_spends_logged: s.cashLogged,
      creator_work_expenses: s.business,
      sajilo_business: { note: "Sajilo is the owner's separate business; it is NOT included in income/spent above", money_in: round2(s.sajilo.in), money_out: round2(s.sajilo.out), net: round2(s.sajilo.net), by_category: s.sajilo.cats.map((c) => ({ category: c.name, amount: round2(c.amount) })) },
      transactions_needing_review: s.unclear.length,
    };
  },

  async search_transactions(a, { db, userId }) {
    const from = isoDate(a.from) ?? addDays(todayIST(), -30);
    const to = isoDate(a.to) ?? todayIST();
    const text = str(a.text)?.toLowerCase();
    const cat = str(a.category)?.toLowerCase();
    const dir = str(a.direction);
    let rows = (await loadTxns(db, from, to, userId)).filter((t) => !(t.source !== "statement" && t.matched_txn_id));
    if (text) rows = rows.filter((t) => [t.description, t.counterparty, t.note, t.person].some((v) => v?.toLowerCase().includes(text)));
    if (cat) rows = rows.filter((t) => (t.category?.name.toLowerCase() ?? "uncategorized") === cat);
    if (dir === "debit" || dir === "credit") rows = rows.filter((t) => t.direction === dir);
    if (a.only_needing_review === true) rows = rows.filter((t) => t.needs_review);
    const limit = Math.min(100, Number(a.limit) || 40);
    const out = rows.reduce((s, t) => s + (t.direction === "debit" ? t.amount : 0), 0);
    const inn = rows.reduce((s, t) => s + (t.direction === "credit" ? t.amount : 0), 0);
    return {
      matches: rows.length,
      total_money_out: round2(out),
      total_money_in: round2(inn),
      showing: Math.min(limit, rows.length),
      transactions: rows.slice(-limit).reverse().map((t) => ({
        id: t.id,
        date: t.txn_date,
        amount: t.amount,
        direction: t.direction,
        payee: t.counterparty ?? null,
        details: (t.note || t.description).slice(0, 80),
        category: t.category?.name ?? "Uncategorized",
        person: t.person,
        needs_review: t.needs_review,
        cash: t.is_cash,
      })),
    };
  },

  async list_deals(a, { db, userId }) {
    let q = db.from("deals").select("id, title, stage, amount, is_barter, deal_date, due_date, next_follow_up, brand:brands!inner(name)").eq("user_id", userId).order("deal_date", { ascending: false }).limit(Math.min(80, Number(a.limit) || 40));
    const stage = str(a.stage);
    if (stage && (STAGE_IDS as string[]).includes(stage)) q = q.eq("stage", stage as never);
    if (str(a.brand)) q = q.ilike("brand.name", `%${str(a.brand)}%`);
    if (str(a.text)) q = q.ilike("title", `%${str(a.text)}%`);
    const { data } = await q;
    return { deals: (data ?? []).map((d) => ({ id: d.id, brand: d.brand.name, title: d.title, stage: stageInfo(d.stage).label, amount: d.amount, barter: d.is_barter, date: d.deal_date, deadline: d.due_date, follow_up: d.next_follow_up })) };
  },

  async brand_overview(a, { db, userId }) {
    const name = str(a.brand) ?? "";
    const { data: brands } = await db.from("brands").select("id, name, category, legal_name, tan, notes").eq("user_id", userId).ilike("name", `%${name}%`).limit(3);
    const brand = brands?.[0];
    if (!brand) return { error: `No brand matching "${name}".` };
    const [deals, invoices, payments, contacts, notes] = await Promise.all([
      db.from("deals").select("id, title, stage, amount, deal_date, due_date, next_follow_up, deliverables(type, quantity, status, link)").eq("brand_id", brand.id).order("deal_date", { ascending: false }),
      db.from("invoices").select("invoice_number, issue_date, due_date, paid_at, subtotal, status, payments(gross_amount)").eq("brand_id", brand.id),
      db.from("payments").select("received_date, gross_amount, tds_amount").eq("brand_id", brand.id),
      db.from("contacts").select("name, email, phone, role").eq("brand_id", brand.id),
      db.from("activities").select("kind, body, created_at").eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(15),
    ]);
    const paidDays = (invoices.data ?? []).filter((i) => i.paid_at).map((i) => daysBetween(i.issue_date, i.paid_at!));
    return {
      brand: brand.name,
      other_matches: (brands ?? []).slice(1).map((b) => b.name),
      category: brand.category,
      notes: brand.notes,
      deals: (deals.data ?? []).map((d) => ({ id: d.id, title: d.title, stage: stageInfo(d.stage).label, amount: d.amount, date: d.deal_date, deadline: d.due_date, follow_up: d.next_follow_up, deliverables: d.deliverables })),
      invoices: (invoices.data ?? []).map((i) => ({ number: i.invoice_number, date: i.issue_date, due: i.due_date, status: i.status, total: i.subtotal, balance: round2(Number(i.subtotal) - i.payments.reduce((s, p) => s + Number(p.gross_amount), 0)) })),
      total_received: round2((payments.data ?? []).reduce((s, p) => s + Number(p.gross_amount), 0)),
      tds_cut: round2((payments.data ?? []).reduce((s, p) => s + Number(p.tds_amount), 0)),
      average_days_to_pay: paidDays.length ? Math.round(paidDays.reduce((s, d) => s + d, 0) / paidDays.length) : null,
      contacts: contacts.data,
      recent_activity: notes.data,
    };
  },

  async list_invoices(a, { db, userId }) {
    let q = db.from("invoices").select("id, invoice_number, issue_date, due_date, subtotal, status, tds_rate, brand:brands(name), deal:deals(title), payments(gross_amount)").eq("user_id", userId).order("issue_date", { ascending: false });
    if (num(a.fy)) q = q.eq("fy", num(a.fy)!);
    const { data } = await q;
    const today = todayIST();
    const status = str(a.status) ?? "all";
    const rows = (data ?? [])
      .map((i) => {
        const balance = round2(Number(i.subtotal) - i.payments.reduce((s, p) => s + Number(p.gross_amount), 0));
        const overdue = ["sent", "partially_paid"].includes(i.status) && !!i.due_date && i.due_date < today;
        return { id: i.id, number: i.invoice_number, brand: i.brand?.name, deal: i.deal?.title, date: i.issue_date, due: i.due_date, total: i.subtotal, balance, status: overdue ? "overdue" : i.status, days_overdue: overdue ? daysBetween(i.due_date!, today) : 0 };
      })
      .filter((i) => status === "all" || (status === "unpaid" ? ["sent", "partially_paid", "draft", "overdue"].includes(i.status) : i.status === status));
    return { invoices: rows, total_balance: round2(rows.reduce((s, i) => s + (i.status === "cancelled" ? 0 : i.balance), 0)) };
  },

  async get_earnings(a, { db, userId }) {
    const from = isoDate(a.from) ?? fyRange(fyOf(todayIST())).from;
    const to = isoDate(a.to) ?? todayIST();
    const { data } = await db.from("payments").select("received_date, gross_amount, tds_amount, brand:brands(name)").eq("user_id", userId).gte("received_date", from).lte("received_date", to);
    const byBrand = new Map<string, number>();
    const byMonth = new Map<string, number>();
    let gross = 0;
    let tds = 0;
    for (const p of data ?? []) {
      gross += Number(p.gross_amount);
      tds += Number(p.tds_amount);
      byBrand.set(p.brand?.name ?? "?", (byBrand.get(p.brand?.name ?? "?") ?? 0) + Number(p.gross_amount));
      byMonth.set(p.received_date.slice(0, 7), (byMonth.get(p.received_date.slice(0, 7)) ?? 0) + Number(p.gross_amount));
    }
    return { from, to, income_before_tds: round2(gross), tds_cut: round2(tds), reached_bank: round2(gross - tds), by_brand: Object.fromEntries(byBrand), by_month: Object.fromEntries([...byMonth].sort()) };
  },

  async get_lending(_a, { db, userId }) {
    const cats = await ensureCategories(db);
    const ids = cats.filter((c) => c.kind === "lending").map((c) => c.id);
    const { data } = await db.from("transactions").select("txn_date, amount, direction, person, source, matched_txn_id").eq("user_id", userId).in("category_id", ids);
    const per = new Map<string, { owes_you: number; last: string }>();
    for (const t of data ?? []) {
      if (t.source !== "statement" && t.matched_txn_id) continue;
      const n = t.person?.trim() || "Not named yet";
      const p = per.get(n) ?? { owes_you: 0, last: t.txn_date };
      p.owes_you = round2(p.owes_you + (t.direction === "debit" ? Number(t.amount) : -Number(t.amount)));
      if (t.txn_date > p.last) p.last = t.txn_date;
      per.set(n, p);
    }
    return { people: Object.fromEntries(per) };
  },

  async get_tds(a, { db, userId }) {
    const fy = num(a.fy) ?? fyOf(todayIST());
    const { from, to } = fyRange(fy);
    const [{ data: pay }, { data: checks }] = await Promise.all([
      db.from("payments").select("gross_amount, tds_amount, brand:brands(name)").eq("user_id", userId).gte("received_date", from).lte("received_date", to),
      db.from("tds_checks").select("tds_in_26as, brand:brands(name)").eq("user_id", userId).eq("fy", fy),
    ]);
    const per = new Map<string, { tds_your_records: number; tds_in_26as: number | null }>();
    for (const p of pay ?? []) {
      const r = per.get(p.brand?.name ?? "?") ?? { tds_your_records: 0, tds_in_26as: null };
      r.tds_your_records = round2(r.tds_your_records + Number(p.tds_amount));
      per.set(p.brand?.name ?? "?", r);
    }
    for (const c of checks ?? []) {
      const r = per.get(c.brand?.name ?? "?") ?? { tds_your_records: 0, tds_in_26as: null };
      r.tds_in_26as = c.tds_in_26as === null ? null : Number(c.tds_in_26as);
      per.set(c.brand?.name ?? "?", r);
    }
    return { fy: fyLabel(fy), by_brand: Object.fromEntries(per) };
  },

  async get_upcoming(a, { db, userId }) {
    const today = todayIST();
    const until = addDays(today, Math.min(60, Number(a.days) || 7));
    const [f, d, dl, inv] = await Promise.all([
      db.from("deals").select("title, next_follow_up, brand:brands(name)").eq("user_id", userId).lte("next_follow_up", until).not("stage", "in", "(paid,lost)"),
      db.from("deliverables").select("type, quantity, due_date, deal:deals(title, brand:brands(name))").eq("user_id", userId).neq("status", "posted").lte("due_date", until),
      db.from("deals").select("title, due_date, brand:brands(name)").eq("user_id", userId).in("stage", ["confirmed", "in_progress"]).lte("due_date", until),
      db.from("invoices").select("invoice_number, due_date, subtotal, brand:brands(name), payments(gross_amount)").eq("user_id", userId).in("status", ["sent", "partially_paid"]).lte("due_date", until),
    ]);
    return {
      today,
      follow_ups: (f.data ?? []).map((x) => ({ brand: x.brand?.name, deal: x.title, date: x.next_follow_up, overdue: x.next_follow_up! < today })),
      content_due: (d.data ?? []).map((x) => ({ what: `${x.quantity}× ${x.type}`, brand: x.deal?.brand?.name, deal: x.deal?.title, date: x.due_date, overdue: x.due_date! < today })),
      deal_deadlines: (dl.data ?? []).map((x) => ({ brand: x.brand?.name, deal: x.title, date: x.due_date })),
      invoices_due: (inv.data ?? []).map((x) => ({ number: x.invoice_number, brand: x.brand?.name, due: x.due_date, balance: round2(Number(x.subtotal) - x.payments.reduce((s, p) => s + Number(p.gross_amount), 0)), overdue: x.due_date! < today })),
    };
  },

  async get_rate_stats(_a, { db, userId }) {
    const [{ data: deals }, { data: card }] = await Promise.all([
      db.from("deals").select("stage, amount, deal_date, brand:brands(name), deliverables(type, quantity)").eq("user_id", userId),
      db.from("rate_card").select("type, platform, price").eq("user_id", userId),
    ]);
    const per = new Map<string, number[]>();
    for (const d of deals ?? []) {
      if (!DONE_STAGES.includes(d.stage as never) || !Number(d.amount)) continue;
      const types = new Set(d.deliverables.map((x) => x.type));
      const qty = d.deliverables.reduce((s, x) => s + x.quantity, 0);
      if (types.size === 1 && qty) per.set([...types][0], [...(per.get([...types][0]) ?? []), Number(d.amount) / qty]);
    }
    const stats = Object.fromEntries(
      [...per].map(([t, xs]) => {
        const s = [...xs].sort((x, y) => x - y);
        return [t, { deals: xs.length, median: round2(s[Math.floor(s.length / 2)]), min: round2(s[0]), max: round2(s[s.length - 1]) }];
      }),
    );
    return { per_piece_from_deals: stats, my_rate_card: card };
  },

  async list_categories(_a, { db }) {
    const cats = await ensureCategories(db);
    return { categories: cats.map((c) => ({ name: c.name, counts_as: c.kind })) };
  },

  async list_bank_accounts(_a, { db, userId }) {
    const { data } = await db.from("bank_accounts").select("id, name, bank, last4, pdf_password, statements(period_to, status)").eq("user_id", userId).eq("is_archived", false);
    return {
      accounts: (data ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        bank: a.bank,
        last4: a.last4,
        pdf_password_saved: Boolean(a.pdf_password),
        latest_statement_until: a.statements.filter((s) => s.status === "done").map((s) => s.period_to).sort().at(-1) ?? null,
      })),
    };
  },

  // ---- Proposals ----
  async propose_new_deal(a, ctx) {
    const brand = str(a.brand);
    const title = str(a.title);
    if (!brand || !title) return { error: "brand and title are required" };
    const stage = (STAGE_IDS as string[]).includes(str(a.stage) ?? "") ? str(a.stage)! : "lead";
    const deliverables = (Array.isArray(a.deliverables) ? a.deliverables : [])
      .map((d: Args) => ({ type: str(d.type) ?? "Other", quantity: Math.max(1, Number(d.quantity) || 1), due_date: isoDate(d.due_date) }))
      .slice(0, 20);
    const payload = {
      brand,
      title,
      stage,
      amount: num(a.amount),
      is_barter: a.is_barter === true,
      platform: str(a.platform),
      deal_date: isoDate(a.deal_date) ?? todayIST(),
      due_date: isoDate(a.due_date),
      next_follow_up: isoDate(a.next_follow_up),
      contact_name: str(a.contact_name),
      contact_email: str(a.contact_email),
      notes: str(a.notes),
      deliverables,
    };
    const { data: existing } = await ctx.db.from("brands").select("name").eq("user_id", ctx.userId).ilike("name", brand).maybeSingle();
    const what = deliverables.map((d) => `${d.quantity}× ${d.type}`).join(", ");
    return propose(ctx, "new_deal", `New deal: ${brand} — ${title}${payload.amount ? ` · ${rupees(payload.amount)}` : ""}${what ? ` · ${what}` : ""} · ${stageInfo(stage).label}${existing ? "" : " (new brand)"}`, payload);
  },

  async propose_deal_update(a, ctx) {
    const id = uuid(a.deal_id);
    const { data: deal } = id ? await ctx.db.from("deals").select("id, title, brand:brands(name)").eq("id", id).eq("user_id", ctx.userId).maybeSingle() : { data: null };
    if (!deal) return { error: "Deal not found — use list_deals to get the right deal_id." };
    const stage = str(a.stage);
    if (stage && !(STAGE_IDS as string[]).includes(stage)) return { error: `Unknown stage. Use one of: ${STAGE_IDS.join(", ")}` };
    const payload = { deal_id: id, stage, amount: num(a.amount), due_date: isoDate(a.due_date), next_follow_up: isoDate(a.next_follow_up), note: str(a.note) };
    const parts = [
      stage && `stage → ${stageInfo(stage).label}`,
      payload.amount !== null && `fee → ${rupees(payload.amount)}`,
      payload.due_date && `deadline → ${payload.due_date}`,
      payload.next_follow_up && `follow up on ${payload.next_follow_up}`,
      payload.note && `note: "${payload.note}"`,
    ].filter(Boolean);
    if (!parts.length) return { error: "Nothing to change." };
    return propose(ctx, "deal_update", `Update ${deal.brand?.name} — ${deal.title}: ${parts.join(", ")}`, payload);
  },

  async propose_entries(a, ctx) {
    const cats = await ensureCategories(ctx.db);
    const entries = (Array.isArray(a.entries) ? a.entries : []).slice(0, 30).map((e: Args) => {
      const cat = cats.find((c) => c.name.toLowerCase() === (str(e.category) ?? "").toLowerCase());
      return {
        amount: Math.abs(num(e.amount) ?? 0),
        direction: str(e.direction) === "credit" ? "credit" : "debit",
        description: str(e.description) ?? "Entry",
        date: isoDate(e.date) ?? todayIST(),
        category: cat?.name ?? null,
        person: str(e.person),
        is_cash: e.is_cash === true,
      };
    }).filter((e) => e.amount > 0);
    if (!entries.length) return { error: "No valid entries (each needs an amount)." };
    const lines = entries.map((e) => `${e.direction === "debit" ? "−" : "+"}${rupees(e.amount)} ${e.description}${e.category ? ` (${e.category})` : ""}${e.is_cash ? " · cash" : ""}${e.person ? ` · ${e.person}` : ""} · ${e.date}`);
    return propose(ctx, "entries", `Add ${entries.length} entr${entries.length === 1 ? "y" : "ies"}:\n${lines.join("\n")}`, { entries });
  },

  async propose_recategorize(a, ctx) {
    const ids = (Array.isArray(a.transaction_ids) ? a.transaction_ids : []).map(uuid).filter(Boolean) as string[];
    const cats = await ensureCategories(ctx.db);
    const cat = cats.find((c) => c.name.toLowerCase() === (str(a.category) ?? "").toLowerCase());
    if (!cat) return { error: `Unknown category. Valid: ${cats.map((c) => c.name).join(", ")}` };
    const { data: rows } = ids.length ? await ctx.db.from("transactions").select("id, txn_date, amount, counterparty, description").eq("user_id", ctx.userId).in("id", ids.slice(0, 200)) : { data: [] };
    if (!rows?.length) return { error: "No matching transactions — use search_transactions to get ids." };
    const pattern = str(a.remember_pattern);
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    return propose(
      ctx,
      "recategorize",
      `Move ${rows.length} transaction${rows.length === 1 ? "" : "s"} (${rupees(total)}) to ${cat.emoji ?? ""} ${cat.name}${pattern ? ` and always use it for "${pattern}"` : ""}:\n${rows.slice(0, 8).map((r) => `${r.txn_date} ${rupees(r.amount)} ${r.counterparty ?? r.description.slice(0, 40)}`).join("\n")}${rows.length > 8 ? `\n…and ${rows.length - 8} more` : ""}`,
      { transaction_ids: rows.map((r) => r.id), category: cat.name, remember_pattern: pattern, person: str(a.person) },
    );
  },

  async propose_invoice_draft(a, ctx) {
    const id = uuid(a.deal_id);
    const { data: deal } = id ? await ctx.db.from("deals").select("id, title, amount, brand:brands(name)").eq("id", id).eq("user_id", ctx.userId).maybeSingle() : { data: null };
    if (!deal) return { error: "Deal not found — use list_deals first." };
    if (!Number(deal.amount)) return { error: "That deal has no fee yet. Ask the user for the amount and propose_deal_update first." };
    return propose(ctx, "invoice_draft", `Draft invoice for ${deal.brand?.name} — ${deal.title} · ${rupees(deal.amount)}`, { deal_id: id });
  },

  async propose_statement_import(a, ctx) {
    const file = ctx.files.find((f) => f.id === str(a.file_id));
    if (!file) return { error: `No attached file ${a.file_id}. Files: ${ctx.files.map((f) => f.id).join(", ") || "none"}` };
    const id = uuid(a.account_id);
    const { data: acc } = id ? await ctx.db.from("bank_accounts").select("id, name").eq("id", id).eq("user_id", ctx.userId).maybeSingle() : { data: null };
    if (!acc) return { error: "Unknown account — use list_bank_accounts (or ask which account)." };
    return propose(ctx, "statement_import", `Read "${file.name}" as a ${acc.name} statement`, { account_id: acc.id, account: acc.name, file_path: file.path, file_name: file.name });
  },

  async propose_tds_from_26as(a, ctx) {
    const fy = num(a.fy);
    if (!fy) return { error: "fy is required" };
    const entries = (Array.isArray(a.entries) ? a.entries : []).map((e: Args) => ({ deductor: str(e.deductor) ?? "?", tan: str(e.tan)?.toUpperCase() ?? null, tds: num(e.tds) ?? 0, amount: num(e.amount) })).slice(0, 100);
    if (!entries.length) return { error: "No entries" };
    return propose(ctx, "tds_26as", `Save 26AS figures for ${fyLabel(fy)}:\n${entries.map((e) => `${e.deductor}${e.tan ? ` (${e.tan})` : ""}: TDS ${rupees(e.tds)}${e.amount ? ` on ${rupees(e.amount)}` : ""}`).join("\n")}`, { fy, entries });
  },

  async propose_past_work_import(a, ctx) {
    const rows = (Array.isArray(a.rows) ? a.rows : []).slice(0, 1000).map((r: Args) => ({
      brand: str(r.brand) ?? "",
      title: str(r.title),
      date: isoDate(r.date),
      deliverables: str(r.deliverables),
      amount: num(r.amount),
      platform: str(r.platform),
      status: str(r.status),
      contact_name: str(r.contact_name),
      contact_email: str(r.contact_email),
      link: str(r.link),
      notes: str(r.notes),
    })).filter((r) => r.brand);
    if (!rows.length) return { error: "No rows with a brand" };
    const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
    return propose(ctx, "past_work", `Import ${rows.length} past collaboration${rows.length === 1 ? "" : "s"} (${rupees(total)}) — ${[...new Set(rows.map((r) => r.brand))].slice(0, 8).join(", ")}${rows.length > 8 ? "…" : ""}`, { rows });
  },

  async propose_attach_to_deal(a, ctx) {
    const file = ctx.files.find((f) => f.id === str(a.file_id));
    if (!file) return { error: `No attached file ${a.file_id}` };
    const id = uuid(a.deal_id);
    const { data: deal } = id ? await ctx.db.from("deals").select("id, title, brand:brands(name)").eq("id", id).eq("user_id", ctx.userId).maybeSingle() : { data: null };
    if (!deal) return { error: "Deal not found — use list_deals first." };
    const kind = ["brief", "contract"].includes(str(a.kind) ?? "") ? str(a.kind)! : "other";
    return propose(ctx, "attach_file", `Attach "${file.name}" as the ${kind} for ${deal.brand?.name} — ${deal.title}`, { deal_id: id, kind, file_path: file.path, file_name: file.name, mime: file.mime });
  },
};

async function propose(ctx: ToolContext, kind: string, summary: string, payload: object) {
  const { data, error } = await ctx.db.from("ai_proposals").insert({ kind, summary, payload: JSON.parse(JSON.stringify(payload)) as NonNullable<Json>, channel: ctx.channel }).select("id").single();
  if (error) return { error: error.message };
  ctx.proposals.push({ id: data.id, kind, summary });
  return { proposal_id: data.id, status: "waiting for the user to tap Confirm", summary };
}
