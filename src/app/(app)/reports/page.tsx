import type { Metadata } from "next";
import Link from "next/link";
import { MonthBars, type MonthBar } from "@/components/month-bars";
import { requireUser } from "@/lib/auth";
import { loadTxns, monthLabel, monthRange, shiftMonth, summarize } from "@/lib/finance/report";
import { rupees, todayIST } from "@/lib/format";
import { fyLabel, fyOf, fyRange } from "@/lib/fy";

export const metadata: Metadata = { title: "Reports" };

const SECTIONS = [
  { href: "/history", icon: "📚", title: "Work history", text: "Every brand and collaboration by year — download for your CA." },
  { href: "/insights", icon: "📈", title: "Rates & who pays on time", text: "What brands pay per reel, your rate card, slow payers." },
  { href: "/tax", icon: "🏛️", title: "TDS & 26AS", text: "TDS brands cut vs what shows under your PAN." },
  { href: "/invoices", icon: "🧾", title: "Invoices", text: "All invoices, unpaid and overdue." },
  { href: "/payments", icon: "💰", title: "Payments received", text: "Money in from brands, with TDS." },
  { href: "/money/transactions", icon: "💳", title: "All transactions", text: "Every personal money line, searchable." },
];

export default async function ReportsPage() {
  const { supabase, userId } = await requireUser();
  const today = todayIST();
  const fy = fyOf(today);
  const { from, to } = fyRange(fy);
  const cur = today.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(cur, i - 11));
  const start = monthRange(months[0]).from;

  const [{ data: pay }, { data: yearPay }, { data: deals }, { data: inv }, txns] = await Promise.all([
    supabase.from("payments").select("received_date, gross_amount, tds_amount").gte("received_date", start),
    supabase.from("payments").select("gross_amount, tds_amount, brand:brands(id, name)").gte("received_date", from).lte("received_date", to),
    supabase.from("deals").select("id").gte("deal_date", from).lte("deal_date", to).in("stage", ["posted", "invoiced", "paid"]),
    supabase.from("invoices").select("subtotal, payments(gross_amount)").in("status", ["sent", "partially_paid"]),
    loadTxns(supabase, start, today, userId),
  ]);

  const earned = (yearPay ?? []).reduce((s, p) => s + Number(p.gross_amount), 0);
  const tds = (yearPay ?? []).reduce((s, p) => s + Number(p.tds_amount), 0);
  const owed = (inv ?? []).reduce((s, i) => s + Number(i.subtotal) - i.payments.reduce((t, p) => t + Number(p.gross_amount), 0), 0);
  const byBrand = new Map<string, { name: string; amount: number }>();
  for (const p of yearPay ?? []) {
    if (!p.brand) continue;
    const b = byBrand.get(p.brand.id) ?? { name: p.brand.name, amount: 0 };
    b.amount += Number(p.gross_amount);
    byBrand.set(p.brand.id, b);
  }
  const topBrands = [...byBrand.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);
  const maxBrand = Math.max(1, ...topBrands.map((b) => b.amount));

  const incomeBars: MonthBar[] = months.map((m) => {
    const rows = (pay ?? []).filter((p) => p.received_date.startsWith(m));
    const g = rows.reduce((s, p) => s + Number(p.gross_amount), 0);
    const t = rows.reduce((s, p) => s + Number(p.tds_amount), 0);
    return { key: m, label: monthLabel(m, true), value: g, detail: g ? `In bank ${rupees(g - t)} · TDS ${rupees(t)}` : undefined };
  });
  const spendBars: MonthBar[] = months.map((m) => {
    const sm = summarize(txns.filter((t) => t.txn_date.startsWith(m)));
    const top = sm.spendingCats[0];
    return { key: m, label: monthLabel(m, true), value: sm.spent, detail: top ? `Biggest: ${top.name} ${rupees(top.amount)}` : undefined };
  });
  const spentYear = spendBars.filter((b) => b.key >= from.slice(0, 7)).reduce((s, b) => s + b.value, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm text-slate-500">{fyLabel(fy)}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Reports</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Num label="Earned this year" value={rupees(earned)} sub={`before TDS · ${deals?.length ?? 0} collabs`} />
        <Num label="TDS cut" value={rupees(tds)} sub="claim it in your ITR" href="/tax" />
        <Num label="Spent this year" value={rupees(spentYear)} sub="personal" href="/money" />
        <Num label="Still owed to you" value={rupees(owed)} href="/invoices?status=unpaid" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-semibold">Creator income by month</h2>
          <p className="mb-4 text-xs text-slate-500">Payments received from brands, before TDS · last 12 months</p>
          <MonthBars data={incomeBars} valueLabel="Earned" />
        </section>
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-semibold">Personal spending by month</h2>
          <p className="mb-4 text-xs text-slate-500">From your statements and entries · last 12 months</p>
          <MonthBars data={spendBars} valueLabel="Spent" color="#0f766e" />
        </section>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold">Top brands this year</h2>
        {topBrands.length ? (
          <ul className="space-y-3">
            {topBrands.map((b) => (
              <li key={b.name}>
                <div className="flex justify-between text-sm"><span className="font-medium">{b.name}</span><span className="tabular-nums">{rupees(b.amount)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(b.amount / maxBrand) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No payments recorded this year yet.</p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="group flex gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow">
            <span className="text-2xl">{s.icon}</span>
            <span>
              <span className="block font-semibold group-hover:text-brand-700">{s.title} →</span>
              <span className="text-sm text-slate-500">{s.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Num({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div className="h-full rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block transition hover:-translate-y-0.5">{body}</Link> : body;
}
