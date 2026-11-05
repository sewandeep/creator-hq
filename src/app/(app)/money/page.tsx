import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ensureCategories } from "@/lib/finance/categories-server";
import { isAiConfigured } from "@/lib/finance/gemini";
import { counts, loadTxns, monthLabel, monthRange, shiftMonth, summarize } from "@/lib/finance/report";
import { fmtDate, rupees, todayIST } from "@/lib/format";
import { InlineCategory } from "./category-select";
import { AddSheet } from "./add-sheet";
import { ResortButton } from "./resort-button";
import { MonthNav } from "./month-nav";
import { QuickAdd } from "./quick-add";
import { ReviewList } from "./review-card";
import { loadReviewItems } from "./review-data";
import { StatementDrop } from "./statement-drop";

export const metadata: Metadata = { title: "Money" };

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const { supabase, userId } = await requireUser();
  const current = todayIST().slice(0, 7);
  const ym = month && /^\d{4}-\d{2}$/.test(month) && month <= current ? month : current;
  const { from, to } = monthRange(ym);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(current, i - 5));

  const categories = await ensureCategories(supabase);
  const [txns, review, { data: accounts }, { data: statements }] = await Promise.all([
    loadTxns(supabase, from, to, userId),
    loadReviewItems(supabase, categories, 3),
    supabase.from("bank_accounts").select("id, name, bank, pdf_password").eq("is_archived", false).order("created_at"),
    supabase.from("statements").select("account_id, period_from, period_to").eq("status", "done"),
  ]);
  const s = summarize(txns);
  const maxCat = Math.max(1, ...s.spendingCats.map((c) => c.amount));
  const leftOver = s.income - s.spent - s.invested;
  const recent = txns.filter(counts).slice(-12).reverse();
  const cashGap = s.cashWithdrawn - s.cashLogged;
  const covered = (accountId: string, m: string) => {
    const r = monthRange(m);
    return (statements ?? []).some((st) => st.account_id === accountId && st.period_from && st.period_to && st.period_from <= r.to && st.period_to >= r.from);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Personal money</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Money</h1>
        </div>
        <div className="flex items-center gap-2">
          <MonthNav ym={ym} base="/money" current={current} />
          <AddSheet categories={categories} today={todayIST()} />
        </div>
      </div>

      <QuickAdd />

      {review.count > 0 && (
        <section id="to-sort" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">To sort <span className="text-sm font-normal text-slate-400">{review.count}</span></h2>
            <div className="flex items-center gap-3">
              <ResortButton className="text-xs text-slate-500 hover:text-slate-800" />
              {review.count > review.items.length && <Link href="/money/review" className="text-sm text-brand-600 hover:underline">Sort all {review.count} →</Link>}
            </div>
          </div>
          <ReviewList categories={categories} items={review.items} />
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Income" value={rupees(s.income)} sub={monthLabel(ym)} />
        <Tile label="Spent" value={rupees(s.spent)} sub={s.business ? `incl. ${rupees(s.business)} creator work` : undefined} />
        <Tile label="Invested" value={rupees(s.invested)} />
        <Tile label="Left over" value={rupees(leftOver)} negative={leftOver < 0} sub="income − spent − invested" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-3">
          <h2 className="mb-4 font-semibold">Where it went</h2>
          {s.spendingCats.length ? (
            <ul className="space-y-3">
              {s.spendingCats.slice(0, 10).map((c) => (
                <li key={`${c.id}-${c.name}`}>
                  <Link href={c.id === "none" ? "/money/review" : `/money/transactions?month=${ym}&category=${c.id}`} className="block hover:opacity-80">
                    <div className="flex justify-between gap-2 text-sm">
                      <span>{c.emoji} {c.name} <span className="text-xs text-slate-400">· {c.count}</span></span>
                      <span className="font-medium tabular-nums">{rupees(c.amount)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${c.id === "none" ? "bg-amber-400" : "bg-brand-500"}`} style={{ width: `${Math.max(2, (c.amount / maxCat) * 100)}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">No spending recorded for {monthLabel(ym)} yet — drop a statement or type an entry above.</p>
          )}
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Statements</h2>
              <Link href="/money/statements" className="text-xs text-brand-600 hover:underline">Accounts →</Link>
            </div>
            <StatementDrop userId={userId} aiReady={isAiConfigured()} accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name, bank: a.bank, hasPassword: Boolean(a.pdf_password) }))} />
            {(accounts ?? []).length > 0 && (
              <div className="mt-4 space-y-2">
                {(accounts ?? []).map((a) => (
                  <div key={a.id}>
                    <div className="mb-1 text-xs font-medium text-slate-600">{a.name}</div>
                    <div className="flex gap-1">
                      {months.map((m) => (
                        <span key={m} title={`${monthLabel(m)}: ${covered(a.id, m) ? "uploaded" : "missing"}`} className={`flex-1 rounded-md py-1 text-center text-[10px] ${covered(a.id, m) ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400"}`}>
                          {monthLabel(m, true).split(" ")[0]}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {(s.sajilo.in > 0 || s.sajilo.out > 0) && (
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-semibold">🏢 Sajilo</h2>
                <span className="text-xs text-slate-400">kept out of your personal totals</span>
              </div>
              <ul className="space-y-1.5 text-sm">
                {s.sajilo.cats.map((c) => (
                  <li key={c.id}>
                    <Link href={`/money/transactions?month=${ym}&category=${c.id}`} className="flex justify-between gap-2 hover:underline">
                      <span>{c.name} <span className="text-xs text-slate-400">· {c.count}</span></span>
                      <span className="font-medium tabular-nums">{c.kind === "income" ? "+" : "−"}{rupees(Math.abs(c.amount))}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm font-semibold">
                <span>Net</span>
                <span className={`tabular-nums ${s.sajilo.net < 0 ? "text-rose-600" : "text-emerald-700"}`}>{rupees(s.sajilo.net)}</span>
              </div>
            </section>
          )}

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Income</h2>
            <ul className="space-y-1.5 text-sm">
              {([["creator", "💼 Creator"], ["freelance", "🧑‍💻 Freelance"], ["other", "💰 Other"]] as const).map(([k, label]) => (
                <li key={k} className="flex justify-between gap-2"><span>{label}</span><span className={`tabular-nums ${s.streams[k] ? "font-medium" : "text-slate-400"}`}>{rupees(s.streams[k])}</span></li>
              ))}
            </ul>
            {s.incomeCats.some((c) => c.id === "none") && (
              <Link href="/money/review" className="mt-2 block text-xs text-amber-700 hover:underline">
                Includes {rupees(s.incomeCats.find((c) => c.id === "none")!.amount)} of money in that isn&apos;t sorted yet →
              </Link>
            )}
            {cashGap > 0 && <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-amber-700">🏧 {rupees(cashGap)} of cash withdrawn isn&apos;t accounted for — type cash spends like &quot;200 chai cash&quot;.</p>}
          </section>

          {(s.family.gave > 0 || s.family.got > 0) && (
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-semibold">👨‍👩‍👧 Family</h2>
                <span className="text-xs text-slate-400">not counted as spending or income</span>
              </div>
              <div className="flex justify-between text-sm"><span>You gave</span><span className="tabular-nums">{rupees(s.family.gave)}</span></div>
              <div className="flex justify-between text-sm"><span>You got</span><span className="tabular-nums">{rupees(s.family.got)}</span></div>
              {s.family.people.length > 1 && (
                <ul className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  {s.family.people.map((p) => (
                    <li key={p.name} className="flex justify-between gap-2"><span>{p.name}</span><span className="tabular-nums">{p.gave ? `gave ${rupees(p.gave)}` : ""}{p.gave && p.got ? " · " : ""}{p.got ? `got ${rupees(p.got)}` : ""}</span></li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {(s.lendingPeople.length > 0 || s.passThrough.count > 0) && (
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              {s.lendingPeople.length > 0 && (
                <>
                  <Link href="/money/lending" className="mb-2 flex items-baseline justify-between hover:underline">
                    <h2 className="font-semibold">🤝 Lending this month</h2>
                    <span className="text-xs text-brand-600">All →</span>
                  </Link>
                  <ul className="space-y-1 text-sm">
                    {s.lendingPeople.map((p) => (
                      <li key={p.name} className="flex justify-between gap-2">
                        <span>{p.name}</span>
                        <span className={`tabular-nums ${p.balance > 0 ? "text-amber-700" : "text-violet-700"}`}>{p.balance > 0 ? `owes you ${rupees(p.balance)}` : `you owe ${rupees(-p.balance)}`}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {s.passThrough.count > 0 && (
                <Link href={`/money/transactions?month=${ym}&kind=passthrough`} className={`flex justify-between gap-2 text-sm hover:underline ${s.lendingPeople.length ? "mt-3 border-t border-slate-100 pt-3" : ""}`}>
                  <span>🔀 Passed through (not counted)</span>
                  <span className="tabular-nums text-slate-500">{rupees(s.passThrough.in)} in · {rupees(s.passThrough.out)} out</span>
                </Link>
              )}
            </section>
          )}
        </div>
      </div>

      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="font-semibold">Recent</h2>
          <Link href={`/money/transactions?month=${ym}`} className="text-sm text-brand-600 hover:underline">All {s.count} →</Link>
        </div>
        {recent.length ? (
          <ul className="divide-y divide-slate-100">
            {recent.map((t) => (
              <li key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-5 py-3 sm:grid-cols-[1fr_auto_auto]">
                <div className="min-w-0">
                  <Link href={`/money/transactions/${t.id}`} className="block truncate text-sm font-medium hover:underline">{t.counterparty || t.note || t.description}</Link>
                  <div className="text-xs text-slate-500">{fmtDate(t.txn_date, true)}{t.is_cash ? " · cash" : ""}{t.person ? ` · ${t.person}` : ""}</div>
                </div>
                <span className={`text-right text-sm font-semibold tabular-nums sm:order-last sm:w-24 ${t.direction === "credit" ? "text-emerald-700" : ""}`}>
                  {t.direction === "debit" ? "−" : "+"}{rupees(t.amount)}
                </span>
                <div className="col-span-2 sm:col-span-1">
                  <InlineCategory transactionId={t.id} categories={categories} direction={t.direction} value={t.category?.id ?? null} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No transactions in {monthLabel(ym)}.</p>
        )}
      </section>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
        <Link href="/money/lending" className="hover:text-slate-900">Who owes me →</Link>
        <Link href="/money/categories" className="hover:text-slate-900">Categories & rules →</Link>
        <Link href="/money/add" className="hover:text-slate-900">Add an entry with all details →</Link>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, negative }: { label: string; value: string; sub?: string; negative?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight sm:text-2xl ${negative ? "text-rose-600" : ""}`}>{value}</div>
      {sub && <div className="truncate text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
