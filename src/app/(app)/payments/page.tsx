import type { Metadata } from "next";
import Link from "next/link";
import { deletePayment } from "@/app/actions/payments";
import { ConfirmButton } from "@/components/forms";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, rupees, todayIST } from "@/lib/format";
import { fyLabel, fyOf, fyRange } from "@/lib/fy";
import { AddPayment } from "./add-payment";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const { fy: fyParam } = await searchParams;
  const { supabase } = await requireUser();
  const today = todayIST();
  const currentFy = fyOf(today);
  const fy = fyParam && /^\d{4}$/.test(fyParam) ? Number(fyParam) : currentFy;
  const { from, to } = fyRange(fy);

  const [{ data, error }, brands, deals] = await Promise.all([
    supabase
      .from("payments")
      .select("*, brand:brands(id, name), invoice:invoices(id, invoice_number), deal:deals(id, title)")
      .gte("received_date", from)
      .lte("received_date", to)
      .order("received_date", { ascending: false }),
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("deals").select("id, title, brand_id").neq("stage", "lost").order("deal_date", { ascending: false }),
  ]);
  if (error) throw error;
  const rows = data ?? [];
  const gross = rows.reduce((t, p) => t + Number(p.gross_amount), 0);
  const tds = rows.reduce((t, p) => t + Number(p.tds_amount), 0);

  return (
    <>
      <PageHeader
        title="Payments received"
        subtitle={`${fyLabel(fy)} · money that came in from brands`}
        actions={
          <div className="flex gap-1">
            <Link href={`/payments?fy=${fy - 1}`} className="btn-secondary">← {fyLabel(fy - 1)}</Link>
            {fy < currentFy && <Link href={`/payments?fy=${fy + 1}`} className="btn-secondary">{fyLabel(fy + 1)} →</Link>}
          </div>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income (before TDS)" value={rupees(gross)} hint="This is your taxable income from brands" />
        <Stat label="Reached your bank" value={rupees(gross - tds)} />
        <Stat label="TDS cut by brands" value={rupees(tds)} hint="You claim this back when filing ITR" href={`/tax?fy=${fy}`} />
        <Stat label="Payments" value={rows.length} />
      </div>

      <div className="mb-4">
        <AddPayment today={today} brands={brands.data ?? []} deals={deals.data ?? []} />
      </div>

      {rows.length === 0 ? (
        <Empty>No payments recorded in {fyLabel(fy)}. Record them from an invoice, or add one above.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Brand</th>
                <th className="th">For</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">TDS</th>
                <th className="th text-right">In bank</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap text-slate-600">{fmtDate(p.received_date)}</td>
                  <td className="td font-medium">{p.brand?.name}</td>
                  <td className="td text-sm">
                    {p.invoice ? <Link href={`/invoices/${p.invoice.id}`} className="link">{p.invoice.invoice_number}</Link> : p.deal ? <Link href={`/deals/${p.deal.id}`} className="link">{p.deal.title}</Link> : "—"}
                    {(p.reference || p.mode) && <div className="text-xs text-slate-500">{[p.mode, p.reference].filter(Boolean).join(" · ")}</div>}
                  </td>
                  <td className="td text-right tabular-nums">{rupees(p.gross_amount)}</td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {Number(p.tds_amount) ? rupees(p.tds_amount) : "—"}
                    {p.tds_section && Number(p.tds_amount) > 0 && <div className="text-xs">{p.tds_section}</div>}
                  </td>
                  <td className="td text-right font-medium tabular-nums">{rupees(p.net_amount)}</td>
                  <td className="td">
                    <ConfirmButton action={deletePayment.bind(null, p.id)} confirmText="Delete this payment?" className="text-xs text-rose-500 hover:underline">
                      Delete
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
