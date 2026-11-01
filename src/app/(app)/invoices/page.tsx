import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceBadge } from "@/components/invoice-badge";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, relativeDay, rupees, todayIST } from "@/lib/format";
import { fyLabel, fyOf } from "@/lib/fy";
import { INVOICE_STATUSES, isOverdue } from "@/lib/money";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; fy?: string }> }) {
  const { status = "", fy: fyParam } = await searchParams;
  const { supabase } = await requireUser();
  const today = todayIST();
  const currentFy = fyOf(today);
  const fy = fyParam === "all" ? null : fyParam && /^\d{4}$/.test(fyParam) ? Number(fyParam) : currentFy;

  let q = supabase
    .from("invoices")
    .select("id, invoice_number, issue_date, due_date, subtotal, status, tds_rate, brand:brands(id, name), deal:deals(id, title), payments(gross_amount, tds_amount)")
    .order("issue_date", { ascending: false })
    .order("seq", { ascending: false });
  if (fy !== null) q = q.eq("fy", fy);
  const { data, error } = await q;
  if (error) throw error;

  const all = (data ?? []).map((i) => {
    const paid = i.payments.reduce((t, p) => t + Number(p.gross_amount), 0);
    return { ...i, paid, balance: Math.max(0, Number(i.subtotal) - paid), overdue: isOverdue(i, today) };
  });
  const shown = all.filter((i) => !status || (status === "overdue" ? i.overdue : status === "unpaid" ? ["sent", "partially_paid"].includes(i.status) : i.status === status));
  const live = all.filter((i) => i.status !== "cancelled");
  const outstanding = live.filter((i) => ["sent", "partially_paid", "draft"].includes(i.status));
  const overdue = live.filter((i) => i.overdue);
  const billed = live.reduce((t, i) => t + Number(i.subtotal), 0);
  const received = live.reduce((t, i) => t + i.paid, 0);

  const link = (p: { status?: string; fy?: string }) => {
    const s = new URLSearchParams();
    const st = p.status ?? status;
    const f = p.fy ?? (fy === null ? "all" : String(fy));
    if (st) s.set("status", st);
    s.set("fy", f);
    return `/invoices?${s}`;
  };

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={fy === null ? "All years" : fyLabel(fy)}
        actions={<Link href="/invoices/new" className="btn-primary">+ New invoice</Link>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Billed" value={rupees(billed)} hint={`${live.length} invoices`} />
        <Stat label="Received (incl. TDS)" value={rupees(received)} />
        <Stat label="Outstanding" value={rupees(outstanding.reduce((t, i) => t + i.balance, 0))} hint={`${outstanding.length} unpaid`} href={link({ status: "unpaid" })} />
        <Stat label="Overdue" value={rupees(overdue.reduce((t, i) => t + i.balance, 0))} hint={`${overdue.length} past due date`} href={link({ status: "overdue" })} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {[{ id: "", label: "All" }, { id: "unpaid", label: "Unpaid" }, { id: "overdue", label: "Overdue" }, ...INVOICE_STATUSES].map((s) => (
          <Link key={s.id || "all"} href={link({ status: s.id })} className={`rounded-full px-3 py-1 ${status === s.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {s.label}
          </Link>
        ))}
        <span className="mx-1 text-slate-300">|</span>
        <Link href={link({ fy: String(currentFy) })} className={`rounded-full px-3 py-1 ${fy === currentFy ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{fyLabel(currentFy)}</Link>
        <Link href={link({ fy: String(currentFy - 1) })} className={`rounded-full px-3 py-1 ${fy === currentFy - 1 ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{fyLabel(currentFy - 1)}</Link>
        <Link href={link({ fy: "all" })} className={`rounded-full px-3 py-1 ${fy === null ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>All years</Link>
      </div>

      {shown.length === 0 ? (
        <Empty action={<Link href="/invoices/new" className="btn-primary">Create an invoice</Link>}>No invoices here.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr>
                <th className="th">Invoice</th>
                <th className="th">Brand</th>
                <th className="th">Date</th>
                <th className="th">Due</th>
                <th className="th text-right">Amount</th>
                <th className="th text-right">Balance</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="td font-medium"><Link href={`/invoices/${i.id}`} className="link">{i.invoice_number}</Link></td>
                  <td className="td">
                    <div>{i.brand?.name}</div>
                    {i.deal && <div className="text-xs text-slate-500">{i.deal.title}</div>}
                  </td>
                  <td className="td whitespace-nowrap text-slate-600">{fmtDate(i.issue_date)}</td>
                  <td className={`td whitespace-nowrap ${i.overdue ? "font-medium text-rose-600" : "text-slate-600"}`}>
                    {fmtDate(i.due_date)}
                    {i.overdue && i.due_date && <div className="text-xs">{relativeDay(i.due_date, today)}</div>}
                  </td>
                  <td className="td text-right tabular-nums">{rupees(i.subtotal)}</td>
                  <td className="td text-right tabular-nums">{i.status === "cancelled" ? "—" : i.balance ? rupees(i.balance) : "✓"}</td>
                  <td className="td"><InvoiceBadge status={i.status} overdue={i.overdue} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
