import type { Metadata } from "next";
import { deleteRate } from "@/app/actions/ratecard";
import { ConfirmButton } from "@/components/forms";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { DONE_STAGES, SOURCES } from "@/lib/constants";
import { addDays, daysBetween, fmtDate, rupees, todayIST } from "@/lib/format";
import { IncomeChart, type MonthPoint } from "./income-chart";
import { RateForm } from "./rate-form";

export const metadata: Metadata = { title: "Rate insights" };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export default async function InsightsPage() {
  const { supabase } = await requireUser();
  const today = todayIST();
  const since = `${addDays(today, -365).slice(0, 7)}-01`;

  const [{ data: deals }, { data: payments }, { data: invoices }, { data: rates }] = await Promise.all([
    supabase.from("deals").select("id, title, stage, amount, source, deal_date, brand:brands(name), deliverables(type, quantity, platform)"),
    supabase.from("payments").select("received_date, gross_amount, tds_amount").gte("received_date", since),
    supabase.from("invoices").select("issue_date, due_date, paid_at, status, subtotal, brand:brands(id, name)").neq("status", "cancelled"),
    supabase.from("rate_card").select("*").order("type"),
  ]);

  // --- Monthly income (last 12 months) ---------------------------------------
  const months: MonthPoint[] = [];
  const startMonth = new Date(`${since}T00:00:00Z`);
  for (let i = 0; i < 13; i++) {
    const d = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + i, 1));
    if (d.toISOString().slice(0, 7) > today.slice(0, 7)) break;
    months.push({ key: d.toISOString().slice(0, 7), label: new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(d), gross: 0, tds: 0 });
  }
  for (const p of payments ?? []) {
    const m = months.find((x) => x.key === p.received_date.slice(0, 7));
    if (m) {
      m.gross += Number(p.gross_amount);
      m.tds += Number(p.tds_amount);
    }
  }
  const last12 = months.slice(-12);
  const yearIncome = last12.reduce((t, m) => t + m.gross, 0);

  // --- Rates per deliverable type --------------------------------------------
  // Only deals where every deliverable is the same type give a clean per-piece rate.
  const done = (deals ?? []).filter((d) => DONE_STAGES.includes(d.stage as never) && Number(d.amount) > 0);
  const byType = new Map<string, { unit: number; date: string; brand: string }[]>();
  const bundles: number[] = [];
  for (const d of done) {
    const types = new Set(d.deliverables.map((x) => x.type));
    const qty = d.deliverables.reduce((t, x) => t + x.quantity, 0);
    if (types.size === 1 && qty > 0) {
      const type = [...types][0];
      byType.set(type, [...(byType.get(type) ?? []), { unit: Number(d.amount) / qty, date: d.deal_date, brand: d.brand?.name ?? "" }]);
    } else if (types.size > 1) bundles.push(Number(d.amount));
  }
  const rateRows = [...byType.entries()]
    .map(([type, xs]) => {
      const sorted = [...xs].sort((a, b) => b.date.localeCompare(a.date));
      const recent = sorted.slice(0, 5).map((x) => x.unit);
      const mine = (rates ?? []).find((r) => r.type.toLowerCase() === type.toLowerCase());
      return {
        type,
        count: xs.length,
        median: median(xs.map((x) => x.unit)),
        min: Math.min(...xs.map((x) => x.unit)),
        max: Math.max(...xs.map((x) => x.unit)),
        latest: sorted[0],
        recentMedian: median(recent),
        mine: mine ? Number(mine.price) : null,
      };
    })
    .sort((a, b) => b.count - a.count);

  // --- Who pays on time ------------------------------------------------------
  const payMap = new Map<string, { name: string; days: number[]; late: number; open: number }>();
  for (const inv of invoices ?? []) {
    if (!inv.brand) continue;
    const r = payMap.get(inv.brand.id) ?? { name: inv.brand.name, days: [], late: 0, open: 0 };
    if (inv.paid_at) {
      r.days.push(daysBetween(inv.issue_date, inv.paid_at));
      if (inv.due_date && inv.paid_at > inv.due_date) r.late++;
    } else if (["sent", "partially_paid"].includes(inv.status)) r.open++;
    payMap.set(inv.brand.id, r);
  }
  const payRows = [...payMap.values()].filter((r) => r.days.length).sort((a, b) => median(b.days) - median(a.days));
  const allDays = payRows.flatMap((r) => r.days);

  // --- Win rate --------------------------------------------------------------
  const decided = (deals ?? []).filter((d) => d.stage === "lost" || ["confirmed", "in_progress", "posted", "invoiced", "paid"].includes(d.stage));
  const won = decided.filter((d) => d.stage !== "lost");
  const bySource = SOURCES.map((s) => {
    const dd = decided.filter((d) => d.source === s.id);
    return { label: s.label, total: dd.length, won: dd.filter((d) => d.stage !== "lost").length };
  }).filter((s) => s.total > 0);

  return (
    <>
      <PageHeader title="Rate insights" subtitle="What you actually earn per piece of content, who pays on time, and how much you're making." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income, last 12 months" value={rupees(yearIncome)} hint="Payments received (before TDS)" />
        <Stat label="Avg. per month" value={rupees(yearIncome / Math.max(1, last12.length))} />
        <Stat label="Win rate" value={decided.length ? `${Math.round((won.length / decided.length) * 100)}%` : "—"} hint={`${won.length} won of ${decided.length} decided`} />
        <Stat label="Typical payment time" value={allDays.length ? `${median(allDays)} days` : "—"} hint="Invoice date → paid" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Income by month" className="lg:col-span-2">
          {yearIncome > 0 ? <IncomeChart data={last12} /> : <Empty>Record payments on your invoices to see this chart.</Empty>}
        </Card>

        <Card title="What brands paid per piece" className="lg:col-span-2">
          {rateRows.length ? (
            <div className="-m-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead>
                  <tr>
                    <th className="th">Type</th>
                    <th className="th text-right">Deals</th>
                    <th className="th text-right">Typical (median)</th>
                    <th className="th text-right">Range</th>
                    <th className="th">Latest</th>
                    <th className="th text-right">Your rate card</th>
                    <th className="th text-right">Suggested quote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rateRows.map((r) => (
                    <tr key={r.type}>
                      <td className="td font-medium">{r.type}</td>
                      <td className="td text-right tabular-nums">{r.count}</td>
                      <td className="td text-right font-medium tabular-nums">{rupees(r.median)}</td>
                      <td className="td text-right text-slate-600 tabular-nums">{r.count > 1 ? `${rupees(r.min)} – ${rupees(r.max)}` : "—"}</td>
                      <td className="td text-sm text-slate-600">{rupees(r.latest.unit)} · {r.latest.brand}, {fmtDate(r.latest.date, true)}</td>
                      <td className="td text-right tabular-nums">
                        {r.mine === null ? <span className="text-slate-400">not set</span> : (
                          <>
                            {rupees(r.mine)}
                            <div className={`text-xs ${r.median < r.mine * 0.9 ? "text-rose-600" : "text-slate-500"}`}>
                              {r.median < r.mine * 0.9 ? `deals pay ${Math.round((1 - r.median / r.mine) * 100)}% below` : "deals are in line"}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="td text-right font-medium text-brand-700 tabular-nums">{rupees(Math.ceil((Math.max(r.recentMedian, r.mine ?? 0) * 1.1) / 500) * 500)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 pt-3 text-xs text-slate-500">
                Uses finished deals where all content was one type (e.g. &quot;2 Reels for ₹50,000&quot; = ₹25,000 per reel). Suggested quote = your recent typical rate (or rate card, whichever is higher) + 10%, rounded.
                {bundles.length > 0 && ` Mixed bundles (${bundles.length} deals) averaged ${rupees(bundles.reduce((t, x) => t + x, 0) / bundles.length)} per deal.`}
              </p>
            </div>
          ) : (
            <Empty>Add deliverables and amounts to finished deals (or import past work) to see your real rates.</Empty>
          )}
        </Card>

        <Card title="My rate card">
          {rates?.length ? (
            <ul className="mb-4 divide-y divide-slate-100">
              {rates.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{r.type}{r.platform ? <span className="text-slate-500"> · {r.platform}</span> : null}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium tabular-nums">{rupees(r.price)}</span>
                    <ConfirmButton action={deleteRate.bind(null, r.id)} confirmText={`Remove ${r.type}?`} className="text-xs text-rose-500 hover:underline">✕</ConfirmButton>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-slate-500">Add what you charge, and I&apos;ll compare it with what deals actually paid.</p>
          )}
          <RateForm />
        </Card>

        <Card title="Who pays on time">
          {payRows.length ? (
            <ul className="divide-y divide-slate-100">
              {payRows.map((r) => (
                <li key={r.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-right">
                    <span className={median(r.days) > 45 ? "font-medium text-rose-600" : median(r.days) > 30 ? "text-amber-700" : "text-slate-700"}>~{median(r.days)} days</span>
                    <span className="block text-xs text-slate-500">
                      {r.days.length} paid{r.late ? ` · ${r.late} late` : ""}{r.open ? ` · ${r.open} open` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Shows up once invoices get paid.</Empty>
          )}
          {bySource.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="label">Win rate by how deals came in</div>
              <ul className="space-y-1 text-sm">
                {bySource.map((s) => (
                  <li key={s.label} className="flex justify-between">
                    <span className="text-slate-600">{s.label}</span>
                    <span className="tabular-nums">{Math.round((s.won / s.total) * 100)}% <span className="text-xs text-slate-400">({s.won}/{s.total})</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
