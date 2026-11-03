import "server-only";
import type { DB } from "@/app/actions/helpers";
import { fmtDate, rupees } from "@/lib/format";
import { STAGES } from "@/lib/constants";

// Turns the raw change log into plain-English lines for the Activity page.

type Row = { table_name: string; op: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; undone_at: string | null; undo_of: string | null; job_id: string | null; group_id: string; at: string };

export type ChangeGroup = {
  groupId: string;
  jobId: string | null;
  at: string;
  undone: boolean;
  undoOf: string | null;
  headline: string;
  lines: string[];
  count: number;
};

export type JobItem = {
  id: string;
  kind: string;
  source: string;
  title: string;
  status: string;
  steps: { at: string; text: string }[];
  summary: string | null;
  error: string | null;
  ref_id: string | null;
  created_at: string;
  finished_at: string | null;
};

export type FeedItem = { type: "job"; at: string; job: JobItem; changes: ChangeGroup | null } | { type: "changes"; at: string; changes: ChangeGroup };

const NOUN: Record<string, [string, string]> = {
  transactions: ["transaction", "transactions"],
  deals: ["deal", "deals"],
  deliverables: ["content item", "content items"],
  brands: ["brand", "brands"],
  contacts: ["contact", "contacts"],
  invoices: ["invoice", "invoices"],
  invoice_items: ["invoice line", "invoice lines"],
  payments: ["payment", "payments"],
  categories: ["category", "categories"],
  category_rules: ["rule", "rules"],
  deal_files: ["file", "files"],
  rate_card: ["rate", "rates"],
  tds_checks: ["TDS check", "TDS checks"],
  email_templates: ["email template", "email templates"],
  activities: ["note", "notes"],
};

const FIELD: Record<string, string> = {
  category_id: "category",
  needs_review: "to sort",
  next_follow_up: "follow-up",
  due_date: "deadline",
  posted_date: "posted on",
  gross_amount: "amount",
  tds_amount: "TDS",
  stage: "stage",
  amount: "amount",
  note: "note",
  person: "person",
  status: "status",
  title: "name",
  name: "name",
  pattern: "rule",
  link: "link",
  platform: "platform",
  notes: "notes",
  payment_id: "linked payment",
  matched_txn_id: "matched entry",
  suggested_invoice_id: "suggested invoice",
};
const QUIET = new Set(["updated_at", "created_at", "user_id", "category_source", "category_reason", "confidence", "review_reason", "stage_changed_at", "hits", "seq", "dedupe_key"]);

const short = (v: unknown, n = 40) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

function label(table: string, r: Record<string, unknown> | null): string {
  if (!r) return "";
  switch (table) {
    case "transactions":
      return `${rupees(Number(r.amount))} ${r.direction === "credit" ? "in" : "out"} · ${short(r.note || r.counterparty || r.description, 36)}${r.txn_date ? ` (${fmtDate(String(r.txn_date))})` : ""}`;
    case "deals":
      return `“${short(r.title)}”`;
    case "deliverables":
      return `${r.quantity ?? 1} ${short(r.type)}`;
    case "invoices":
      return `invoice ${short(r.invoice_number)}`;
    case "payments":
      return `payment ${rupees(Number(r.gross_amount))}`;
    case "category_rules":
      return `rule “${short(r.pattern)}”`;
    case "activities":
      return `“${short(r.body)}”`;
    default:
      return r.name ? `“${short(r.name)}”` : "";
  }
}

function value(key: string, v: unknown, cats: Map<string, string>): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "category_id") return cats.get(String(v)) ?? "a category";
  if (key === "stage") return STAGES.find((s) => s.id === v)?.label ?? String(v);
  if (key === "needs_review") return v ? "yes" : "no";
  if (key.endsWith("_id")) return "set";
  if (/amount|price|balance/.test(key) && !Number.isNaN(Number(v))) return rupees(Number(v));
  if (/date|follow_up/.test(key) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return fmtDate(v.slice(0, 10));
  return short(v, 30);
}

function describeRow(row: Row, cats: Map<string, string>): string | null {
  const noun = NOUN[row.table_name]?.[0] ?? row.table_name;
  if (row.op === "insert") return `Added ${noun} ${label(row.table_name, row.after)}`.trim();
  if (row.op === "delete") return `Removed ${noun} ${label(row.table_name, row.before)}`.trim();
  const b = row.before ?? {};
  const a = row.after ?? {};
  const keys = Object.keys(a).filter((k) => !QUIET.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  if (!keys.length) return null;
  // "Marked as sorted" reads better than "to sort: yes → no".
  if (keys.length === 1 && keys[0] === "needs_review") return `${a.needs_review ? "Flagged" : "Sorted"} ${label(row.table_name, a)}`;
  const parts = keys.filter((k) => k !== "needs_review").slice(0, 3).map((k) => `${FIELD[k] ?? k.replace(/_/g, " ")}: ${value(k, b[k], cats)} → ${value(k, a[k], cats)}`);
  return `${label(row.table_name, a) || noun} — ${parts.join(", ")}`;
}

function summarise(rows: Row[], cats: Map<string, string>): { headline: string; lines: string[] } {
  // Notes added automatically alongside other changes are just noise here.
  const main = rows.filter((r) => r.table_name !== "activities" || rows.every((x) => x.table_name === "activities"));
  const counts = new Map<string, number>();
  for (const r of main) counts.set(`${r.op}|${r.table_name}`, (counts.get(`${r.op}|${r.table_name}`) ?? 0) + 1);
  const verb = { insert: "Added", update: "Changed", delete: "Removed" } as Record<string, string>;
  const headline = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, n]) => {
      const [op, t] = k.split("|");
      const [one, many] = NOUN[t] ?? [t, t];
      return `${verb[op]} ${n} ${n === 1 ? one : many}`;
    })
    .join(" · ");
  const lines = main.map((r) => describeRow(r, cats)).filter((l): l is string => Boolean(l));
  return { headline, lines };
}

/** Everything that happened recently: jobs (with their changes) and your own edits. */
export async function loadActivity(db: DB, opts: { limit?: number } = {}): Promise<FeedItem[]> {
  const limit = opts.limit ?? 80;
  const [{ data: jobs }, { data: log }, { data: categories }] = await Promise.all([
    db.from("jobs").select("id, kind, source, title, status, steps, summary, error, ref_id, created_at, finished_at").order("created_at", { ascending: false }).limit(limit),
    db.from("audit_log").select("table_name, op, before, after, undone_at, undo_of, job_id, group_id, at").order("id", { ascending: false }).limit(1500),
    db.from("categories").select("id, name"),
  ]);
  const cats = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const groups = new Map<string, Row[]>();
  for (const r of (log ?? []) as Row[]) {
    const g = groups.get(r.group_id) ?? [];
    g.push(r);
    groups.set(r.group_id, g);
  }
  const changeGroups = new Map<string, ChangeGroup>();
  for (const [groupId, rows] of groups) {
    rows.reverse(); // oldest first
    const { headline, lines } = summarise(rows, cats);
    if (!lines.length && !headline) continue;
    changeGroups.set(groupId, {
      groupId,
      jobId: rows[0].job_id,
      at: rows[0].at,
      undone: rows.some((r) => r.undone_at),
      undoOf: rows[0].undo_of,
      headline,
      lines,
      count: rows.length,
    });
  }

  const feed: FeedItem[] = [];
  for (const j of (jobs ?? []) as unknown as JobItem[]) {
    const changes = changeGroups.get(j.id) ?? null;
    changeGroups.delete(j.id);
    feed.push({ type: "job", at: j.created_at, job: { ...j, steps: Array.isArray(j.steps) ? j.steps : [] }, changes });
  }
  for (const g of changeGroups.values()) {
    if (g.jobId) continue; // belongs to an older job not in this page
    feed.push({ type: "changes", at: g.at, changes: g });
  }
  feed.sort((a, b) => (a.at < b.at ? 1 : -1));
  return feed.slice(0, limit * 2);
}
