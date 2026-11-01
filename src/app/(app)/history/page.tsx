import type { Metadata } from "next";
import Link from "next/link";
import { Card, Empty, PageHeader, Stat, StageBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, rupees, todayIST } from "@/lib/format";
import { fyLabel, fyOf } from "@/lib/fy";
import { loadHistory } from "./data";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const { fy: fyParam } = await searchParams;
  const { supabase } = await requireUser();
  const currentFy = fyOf(todayIST());
  const fy = fyParam === "all" ? null : fyParam && /^\d{4}$/.test(fyParam) ? Number(fyParam) : null;

  const [rows, { data: allDates }] = await Promise.all([
    loadHistory(supabase, fy),
    supabase.from("deals").select("deal_date").order("deal_date").limit(1),
  ]);
  const firstFy = allDates?.[0] ? fyOf(allDates[0].deal_date) : currentFy;
  const years = Array.from({ length: currentFy - firstFy + 1 }, (_, i) => currentFy - i);

  const paid = rows.filter((r) => r.stage === "paid");
  const earned = paid.reduce((t, r) => t + Number(r.amount ?? 0), 0);
  const unpaid = rows.filter((r) => r.stage !== "paid").reduce((t, r) => t + Number(r.amount ?? 0), 0);
  const barterValue = rows.reduce((t, r) => t + (r.is_barter ? Number(r.barter_value ?? 0) : 0), 0);

  const byBrand = new Map<string, { id: string; name: string; category: string | null; deals: number; earned: number; billed: number }>();
  const byType = new Map<string, number>();
  for (const r of rows) {
    const b = byBrand.get(r.brand.id) ?? { id: r.brand.id, name: r.brand.name, category: r.brand.category, deals: 0, earned: 0, billed: 0 };
    b.deals++;
    b.billed += Number(r.amount ?? 0);
    if (r.stage === "paid") b.earned += Number(r.amount ?? 0);
    byBrand.set(r.brand.id, b);
    for (const d of r.deliverables) byType.set(d.type, (byType.get(d.type) ?? 0) + d.quantity);
  }
  const brands = [...byBrand.values()].sort((a, b) => b.billed - a.billed);
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const totalPieces = types.reduce((t, [, n]) => t + n, 0);

  return (
    <>
      <PageHeader
        title="Work history"
        subtitle={`${fy === null ? "All time" : fyLabel(fy)} · everything posted, invoiced or paid`}
        actions={
          <>
            <a href={`/history/export?fy=${fy ?? "all"}`} className="btn-secondary">Download CSV</a>
            <PrintButton />
          </>
        }
      />

      <div className="no-print mb-6 flex flex-wrap gap-2">
        <Link href="/history?fy=all" className={`rounded-full px-3 py-1 text-sm ${fy === null ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>All time</Link>
        {years.map((y) => (
          <Link key={y} href={`/history?fy=${y}`} className={`rounded-full px-3 py-1 text-sm ${fy === y ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {fyLabel(y)}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty action={<Link href="/import" className="btn-primary">Import past work</Link>}>No finished work in this period yet.</Empty>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Earned (paid)" value={rupees(earned)} hint={`${paid.length} paid deals`} />
            <Stat label="Billed, not paid yet" value={rupees(unpaid)} />
            <Stat label="Brands worked with" value={brands.length} hint={`${rows.length} collaborations`} />
            <Stat label="Content pieces" value={totalPieces} hint={barterValue ? `+ ${rupees(barterValue)} in products` : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="By brand" className="lg:col-span-2">
              <div className="-m-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead>
                    <tr>
                      <th className="th">Brand</th>
                      <th className="th">Category</th>
                      <th className="th text-right">Collabs</th>
                      <th className="th text-right">Billed</th>
                      <th className="th text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {brands.map((b) => (
                      <tr key={b.id}>
                        <td className="td font-medium"><Link href={`/brands/${b.id}`} className="link">{b.name}</Link></td>
                        <td className="td text-slate-600">{b.category ?? "—"}</td>
                        <td className="td text-right tabular-nums">{b.deals}</td>
                        <td className="td text-right tabular-nums">{rupees(b.billed)}</td>
                        <td className="td text-right font-medium tabular-nums">{rupees(b.earned)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Content made">
              {types.length ? (
                <ul className="space-y-2 text-sm">
                  {types.map(([type, n]) => (
                    <li key={type} className="flex justify-between">
                      <span>{type}</span>
                      <span className="font-medium tabular-nums">{n}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No deliverables recorded.</p>
              )}
            </Card>
          </div>

          <Card title="All collaborations">
            <div className="-m-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Brand</th>
                    <th className="th">Work</th>
                    <th className="th">Platform</th>
                    <th className="th text-right">Amount</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="td whitespace-nowrap text-slate-600">{fmtDate(r.deal_date)}</td>
                      <td className="td font-medium">{r.brand.name}</td>
                      <td className="td">
                        <Link href={`/deals/${r.id}`} className="link">{r.title}</Link>
                        {r.deliverables.length > 0 && (
                          <div className="text-xs text-slate-500">{r.deliverables.map((d) => `${d.quantity > 1 ? `${d.quantity}× ` : ""}${d.type}`).join(", ")}</div>
                        )}
                      </td>
                      <td className="td text-slate-600">{r.platform ?? "—"}</td>
                      <td className="td text-right tabular-nums">{r.amount ? rupees(r.amount) : r.is_barter ? "Barter" : "—"}</td>
                      <td className="td"><StageBadge stage={r.stage} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
