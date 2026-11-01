import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { rupees, todayIST } from "@/lib/format";
import { fyLabel, fyOf, fyRange } from "@/lib/fy";

export const metadata: Metadata = { title: "Reports" };

const SECTIONS = [
  { href: "/history", icon: "📚", title: "Work history", text: "Every brand and collaboration, by year. Download for your CA." },
  { href: "/insights", icon: "📈", title: "Income & rates", text: "Monthly income, what brands pay per reel, who pays on time." },
  { href: "/tax", icon: "🏛️", title: "TDS & 26AS", text: "TDS brands cut vs what shows under your PAN." },
  { href: "/invoices", icon: "🧾", title: "Invoices", text: "All invoices, unpaid and overdue." },
  { href: "/payments", icon: "💰", title: "Payments received", text: "Money in from brands, with TDS." },
  { href: "/money/transactions", icon: "💳", title: "All transactions", text: "Personal money, every line, searchable." },
];

export default async function ReportsPage() {
  const { supabase } = await requireUser();
  const fy = fyOf(todayIST());
  const { from, to } = fyRange(fy);
  const [{ data: pay }, { data: deals }, { data: inv }] = await Promise.all([
    supabase.from("payments").select("gross_amount, tds_amount, brand_id").gte("received_date", from).lte("received_date", to),
    supabase.from("deals").select("stage, deal_date").gte("deal_date", from).lte("deal_date", to).in("stage", ["posted", "invoiced", "paid"]),
    supabase.from("invoices").select("subtotal, status, payments(gross_amount)").in("status", ["sent", "partially_paid"]),
  ]);
  const earned = (pay ?? []).reduce((s, p) => s + Number(p.gross_amount), 0);
  const tds = (pay ?? []).reduce((s, p) => s + Number(p.tds_amount), 0);
  const brands = new Set((pay ?? []).map((p) => p.brand_id)).size;
  const owed = (inv ?? []).reduce((s, i) => s + Number(i.subtotal) - i.payments.reduce((t, p) => t + Number(p.gross_amount), 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm text-slate-500">{fyLabel(fy)}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Reports</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Num label="Earned this year" value={rupees(earned)} sub="before TDS" />
        <Num label="TDS cut" value={rupees(tds)} sub="claim it in your ITR" />
        <Num label="Collaborations done" value={String(deals?.length ?? 0)} sub={`${brands} brands paid`} />
        <Num label="Still owed to you" value={rupees(owed)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="group flex gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow">
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

function Num({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
