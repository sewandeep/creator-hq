import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ensureCategories } from "@/lib/finance/categories-server";
import { counts, loadTxns, monthRange } from "@/lib/finance/report";
import { fmtDate, rupees, todayIST } from "@/lib/format";
import { InlineCategory } from "../category-select";
import { AddSheet } from "../add-sheet";
import { MonthNav } from "../month-nav";
import { QuickAdd } from "../quick-add";

export const metadata: Metadata = { title: "Transactions" };

type Search = { month?: string; account?: string; category?: string; kind?: string; q?: string; review?: string; dir?: string };

const KINDS = [
  ["expense", "Spending"],
  ["income", "Income"],
  ["family", "Family"],
  ["lending", "Lending & borrowing"],
  ["passthrough", "Pass-through"],
  ["transfer", "Transfers"],
  ["savings", "Investments"],
  ["none", "Not sorted yet"],
] as const;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const current = todayIST().slice(0, 7);
  const ym = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : current;
  const { from, to } = monthRange(ym);
  const [categories, all, { data: accounts }] = await Promise.all([
    ensureCategories(supabase),
    loadTxns(supabase, from, to),
    supabase.from("bank_accounts").select("id, name").order("created_at"),
  ]);
  const accName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const needle = sp.q?.trim().toLowerCase() ?? "";

  const rows = all
    .filter((t) => !sp.account || t.account_id === sp.account)
    .filter((t) => !sp.category || t.category?.id === sp.category)
    .filter((t) => !sp.kind || (sp.kind === "none" ? !t.category : t.category?.kind === sp.kind))
    .filter((t) => !sp.dir || t.direction === sp.dir)
    .filter((t) => !sp.review || t.needs_review)
    .filter((t) => !needle || [t.description, t.counterparty, t.note, t.person].some((v) => v?.toLowerCase().includes(needle)))
    .reverse();
  const live = rows.filter(counts);
  const out = live.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0);
  const inn = live.filter((t) => t.direction === "credit").reduce((s, t) => s + t.amount, 0);
  const extra = (["account", "category", "kind", "q", "review", "dir"] as const).map((k) => (sp[k] ? `&${k}=${encodeURIComponent(sp[k]!)}` : "")).join("");

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={`${rows.length} shown · ${rupees(out)} out · ${rupees(inn)} in`}
        actions={
          <>
            <MonthNav ym={ym} base="/money/transactions" current={current} extra={extra} />
            <AddSheet categories={categories} today={todayIST()} className="btn-secondary" />
          </>
        }
      />
      <div className="mb-4"><QuickAdd /></div>

      <form className="mb-4 flex flex-wrap gap-2" action="/money/transactions">
        <input type="hidden" name="month" value={ym} />
        <input name="q" defaultValue={sp.q} placeholder="Search payee, person, note…" className="input max-w-52" />
        <select name="dir" defaultValue={sp.dir ?? ""} className="input w-auto">
          <option value="">In & out</option>
          <option value="debit">Money out</option>
          <option value="credit">Money in</option>
        </select>
        <select name="kind" defaultValue={sp.kind ?? ""} className="input w-auto">
          <option value="">All types</option>
          {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select name="account" defaultValue={sp.account ?? ""} className="input w-auto">
          <option value="">All accounts</option>
          {accounts?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} className="input w-auto">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" name="review" value="1" defaultChecked={Boolean(sp.review)} /> Needs review
        </label>
        <button className="btn-secondary">Filter</button>
        {extra && <Link href={`/money/transactions?month=${ym}`} className="btn-ghost">Clear</Link>}
      </form>

      {rows.length === 0 ? (
        <Empty action={<Link href="/money/upload" className="btn-primary">Upload a statement</Link>}>No transactions here.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Details</th>
                <th className="th">Category</th>
                <th className="th text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => {
                const shadow = !counts(t);
                return (
                  <tr key={t.id} className={`hover:bg-slate-50 ${shadow ? "opacity-60" : ""}`}>
                    <td className="td whitespace-nowrap text-slate-600">{fmtDate(t.txn_date, true)}</td>
                    <td className="td max-w-md">
                      <Link href={`/money/transactions/${t.id}`} className="block truncate font-medium hover:underline">
                        {t.counterparty || t.note || t.description}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="truncate">{t.source === "statement" ? accName.get(t.account_id ?? "") ?? "Bank" : t.source === "telegram" ? "Telegram" : "Typed by you"}</span>
                        {t.note && t.counterparty && <span className="truncate">· {t.note}</span>}
                        {t.person && <Badge>{t.person}</Badge>}
                        {t.is_cash && <Badge tone="amber">Cash</Badge>}
                        {shadow && <Badge tone="violet">Linked to bank entry</Badge>}
                        {t.needs_review && <Badge tone="amber">Review</Badge>}
                      </div>
                    </td>
                    <td className="td">
                      <InlineCategory transactionId={t.id} categories={categories} direction={t.direction} value={t.category?.id ?? null} />
                    </td>
                    <td className={`td text-right font-medium whitespace-nowrap tabular-nums ${t.direction === "credit" ? "text-emerald-700" : ""}`}>
                      {t.direction === "debit" ? "−" : "+"}{rupees(t.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Faded rows are your own entries that were matched to a bank transaction — they&apos;re shown for reference but only counted once.</p>
    </>
  );
}
