import type { Metadata } from "next";
import Link from "next/link";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ensureCategories } from "@/lib/finance/categories-server";
import { loadTxns, monthLabel, monthRange, shiftMonth, summarize } from "@/lib/finance/report";
import { rupees, todayIST } from "@/lib/format";
import { MonthNav } from "./month-nav";
import { QuickAdd } from "./quick-add";

export const metadata: Metadata = { title: "Money" };

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const { supabase } = await requireUser();
  await ensureCategories(supabase);
  const current = todayIST().slice(0, 7);
  const ym = month && /^\d{4}-\d{2}$/.test(month) && month <= current ? month : current;
  const { from, to } = monthRange(ym);
  const sixAgo = shiftMonth(ym, -5);

  const [txns, history, { data: accounts }, { data: statements }, { count: reviewCount }] = await Promise.all([
    loadTxns(supabase, from, to),
    loadTxns(supabase, monthRange(sixAgo).from, to),
    supabase.from("bank_accounts").select("id, name, bank").eq("is_archived", false).order("created_at"),
    supabase.from("statements").select("account_id, period_from, period_to, status").eq("status", "done"),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("needs_review", true),
  ]);
  const s = summarize(txns);
  const maxCat = Math.max(1, ...s.spendingCats.map((c) => c.amount));
  const leftOver = s.income - s.spent - s.invested;

  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(ym, i - 5));
  const trend = months.map((m) => {
    const sm = summarize(history.filter((t) => t.txn_date.startsWith(m)));
    return { m, income: sm.income, spent: sm.spent };
  });
  const covered = (accountId: string, m: string) => {
    const r = monthRange(m);
    return (statements ?? []).some((st) => st.account_id === accountId && st.period_from && st.period_to && st.period_from <= r.to && st.period_to >= r.from);
  };
  const outstandingLent = s.lent - s.returned;
  const cashGap = s.cashWithdrawn - s.cashLogged;

  return (
    <>
      <PageHeader
        title="Money"
        subtitle="Where your money came from and where it went."
        actions={
          <>
            <MonthNav ym={ym} base="/money" current={current} />
            <Link href="/money/upload" className="btn-primary">Upload statement</Link>
          </>
        }
      />

      <div className="mb-4">
        <QuickAdd />
      </div>

      {(reviewCount ?? 0) > 0 && (
        <Link href="/money/review" className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <span>
            <b>{reviewCount}</b> transaction{reviewCount === 1 ? "" : "s"} need you — the AI wasn&apos;t sure what they were.
          </span>
          <span className="font-medium">Review →</span>
        </Link>
      )}

      {!accounts?.length ? (
        <Empty action={<Link href="/money/statements" className="btn-primary">Add your bank accounts</Link>}>
          Start by adding your Kotak and SBI accounts, then upload a statement. You can also type entries above any time.
        </Empty>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income" value={rupees(s.income)} hint={`${monthLabel(ym, true)}`} href={`/money/transactions?month=${ym}&kind=income`} />
        <Stat label="Spent" value={rupees(s.spent)} hint={s.business ? `incl. ${rupees(s.business)} creator work` : undefined} href={`/money/transactions?month=${ym}&kind=expense`} />
        <Stat label="Invested" value={rupees(s.invested)} />
        <Stat label="Left over" value={<span className={leftOver < 0 ? "text-rose-600" : ""}>{rupees(leftOver)}</span>} hint="Income − spent − invested" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Where it went" className="lg:col-span-2" action={<Link href={`/money/transactions?month=${ym}`} className="link text-xs">All transactions →</Link>}>
          {s.spendingCats.length ? (
            <ul className="space-y-2.5">
              {s.spendingCats.map((c) => (
                <li key={`${c.id}-${c.name}`}>
                  <Link href={c.id === "none" ? "/money/review" : `/money/transactions?month=${ym}&category=${c.id}`} className="block hover:opacity-80">
                    <div className="flex justify-between gap-2 text-sm">
                      <span>{c.emoji} {c.name} <span className="text-xs text-slate-400">· {c.count}</span></span>
                      <span className="font-medium tabular-nums">{rupees(c.amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${c.id === "none" ? "bg-amber-400" : "bg-brand-500"}`} style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No spending recorded for {monthLabel(ym)} yet.</Empty>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Money in">
            {s.incomeCats.length ? (
              <ul className="space-y-1.5 text-sm">
                {s.incomeCats.map((c) => (
                  <li key={`${c.id}-${c.name}`} className="flex justify-between gap-2">
                    <span>{c.emoji} {c.name}</span>
                    <span className="font-medium tabular-nums">{rupees(c.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Nothing yet.</p>
            )}
          </Card>

          <Card title="Biggest payees">
            {s.topPayees.length ? (
              <ul className="space-y-1.5 text-sm">
                {s.topPayees.map((p) => (
                  <li key={p.name} className="flex justify-between gap-2">
                    <span className="truncate">{p.name} <span className="text-xs text-slate-400">×{p.count}</span></span>
                    <span className="tabular-nums">{rupees(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Nothing yet.</p>
            )}
          </Card>

          {(s.cashWithdrawn > 0 || s.lent > 0 || s.returned > 0) && (
            <Card title="Cash & lending">
              <ul className="space-y-1.5 text-sm">
                {s.cashWithdrawn > 0 && (
                  <li className="flex justify-between gap-2">
                    <span>Cash withdrawn</span>
                    <span className="tabular-nums">{rupees(s.cashWithdrawn)}</span>
                  </li>
                )}
                {cashGap > 0 && (
                  <li className="text-xs text-amber-700">{rupees(cashGap)} of that cash isn&apos;t accounted for — add cash spends like &quot;200 chai cash&quot;.</li>
                )}
                {s.lent > 0 && <li className="flex justify-between gap-2"><span>Lent</span><span className="tabular-nums">{rupees(s.lent)}</span></li>}
                {s.returned > 0 && <li className="flex justify-between gap-2"><span>Got back</span><span className="tabular-nums">{rupees(s.returned)}</span></li>}
                {outstandingLent !== 0 && <li><Link href="/money/lending" className="link text-xs">See who owes you →</Link></li>}
              </ul>
            </Card>
          )}
        </div>

        <Card title="Last 6 months" className="lg:col-span-2">
          <div className="-m-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr>
                  <th className="th">Month</th>
                  <th className="th text-right">Income</th>
                  <th className="th text-right">Spent</th>
                  <th className="th text-right">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trend.map((r) => (
                  <tr key={r.m} className={r.m === ym ? "bg-brand-50/50" : ""}>
                    <td className="td"><Link href={`/money?month=${r.m}`} className="hover:underline">{monthLabel(r.m)}</Link></td>
                    <td className="td text-right tabular-nums">{rupees(r.income)}</td>
                    <td className="td text-right tabular-nums">{rupees(r.spent)}</td>
                    <td className={`td text-right font-medium tabular-nums ${r.income - r.spent < 0 ? "text-rose-600" : "text-emerald-700"}`}>{rupees(r.income - r.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Statements uploaded" action={<Link href="/money/statements" className="link text-xs">Manage →</Link>}>
          {accounts?.length ? (
            <div className="space-y-3">
              {accounts.map((a) => (
                <div key={a.id}>
                  <div className="mb-1 text-sm font-medium">{a.name}</div>
                  <div className="flex gap-1">
                    {months.map((m) => {
                      const ok = covered(a.id, m);
                      return (
                        <Link
                          key={m}
                          href={ok ? `/money/transactions?month=${m}&account=${a.id}` : "/money/upload"}
                          title={`${monthLabel(m)}: ${ok ? "uploaded" : "missing"}`}
                          className={`flex-1 rounded-md py-1 text-center text-[11px] ${ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400"}`}
                        >
                          {monthLabel(m, true).split(" ")[0]}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500">Green = statement uploaded for that month.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No bank accounts yet.</p>
          )}
        </Card>
      </div>
    </>
  );
}
