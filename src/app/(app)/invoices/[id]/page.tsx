import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelInvoice, deleteInvoice, markInvoiceSent, reopenInvoice } from "@/app/actions/invoices";
import { deletePayment } from "@/app/actions/payments";
import { ConfirmButton } from "@/components/forms";
import { InvoiceBadge } from "@/components/invoice-badge";
import { PaymentForm } from "@/components/payment-form";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, relativeDay, rupees, todayIST } from "@/lib/format";
import { loadInvoice } from "@/lib/invoice-data";
import { isOverdue, round2 } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("invoices").select("invoice_number").eq("id", id).maybeSingle();
  return { title: data ? `Invoice ${data.invoice_number}` : "Invoice" };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const today = todayIST();
  const data = await loadInvoice(supabase, id);
  if (!data) notFound();
  const { invoice: inv, pdf, paid, tdsCut, balance } = data;
  const { data: emails } = await supabase.from("email_log").select("id, to_addresses, subject, status, created_at").eq("invoice_id", id).order("created_at", { ascending: false });

  const overdue = isOverdue(inv, today);
  const rate = Number(inv.tds_rate ?? 0);
  const expectedTds = round2((balance * rate) / 100);
  const expectedTdsTotal = round2((Number(inv.subtotal) * rate) / 100);
  const live = inv.status !== "cancelled";

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/invoices" className="text-slate-500 hover:underline">Invoices</Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <Link href={`/brands/${inv.brand?.id}`} className="text-slate-500 hover:underline">{inv.brand?.name}</Link>
      </div>
      <PageHeader
        title={`Invoice ${inv.invoice_number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <InvoiceBadge status={inv.status} overdue={overdue} />
            <span className="font-medium text-slate-700">{rupees(inv.subtotal)}</span>
            {inv.due_date && live && inv.status !== "paid" && (
              <span className={overdue ? "text-rose-600" : ""}>· due {fmtDate(inv.due_date)} ({relativeDay(inv.due_date, today).toLowerCase()})</span>
            )}
            {inv.deal && (
              <span>
                · <Link href={`/deals/${inv.deal.id}`} className="link">{inv.deal.title}</Link>
              </span>
            )}
          </span>
        }
        actions={
          <>
            {live && (
              <Link
                href={`/email/compose?invoice=${inv.id}&template=${encodeURIComponent(overdue ? "Payment reminder" : "Send invoice")}`}
                className="btn-primary"
              >
                {overdue ? "Send reminder" : "Email to brand"}
              </Link>
            )}
            <a href={`/invoices/${inv.id}/pdf?download`} className="btn-secondary">Download PDF</a>
            <Link href={`/invoices/${inv.id}/edit`} className="btn-secondary">Edit</Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="Preview" action={<a href={`/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer" className="link text-xs">Open PDF ↗</a>}>
            <iframe src={`/invoices/${inv.id}/pdf#toolbar=0&view=FitH`} title="Invoice PDF" className="hidden h-[720px] w-full rounded-lg border border-slate-200 lg:block" />
            <div className="lg:hidden">
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Bill to</dt><dd className="font-medium">{inv.bill_to_name}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Date</dt><dd>{fmtDate(inv.issue_date)}</dd></div>
              </dl>
              <ul className="my-3 divide-y divide-slate-100 border-y border-slate-100">
                {pdf.items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2 text-sm">
                    <span>{it.description}{it.quantity !== 1 ? ` × ${it.quantity}` : ""}</span>
                    <span className="tabular-nums">{rupees(it.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between font-semibold"><span>Total</span><span>{rupees(inv.subtotal)}</span></div>
              <a href={`/invoices/${inv.id}/pdf`} className="btn-secondary mt-3 w-full">View PDF</a>
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Money">
            <dl className="space-y-2 text-sm">
              <Row label="Invoice total" value={rupees(inv.subtotal)} strong />
              {rate > 0 && <Row label={`Expected TDS (${rate}%${inv.tds_section && inv.tds_section !== "other" ? `, ${inv.tds_section}` : ""})`} value={rupees(expectedTdsTotal)} />}
              <Row label="Received in bank" value={rupees(paid - tdsCut)} />
              <Row label="TDS cut by brand" value={rupees(tdsCut)} />
              <Row label="Balance due" value={live ? rupees(balance) : "—"} strong />
            </dl>
          </Card>

          <Card title={`Payments${inv.payments.length ? ` (${inv.payments.length})` : ""}`}>
            {inv.payments.length > 0 && (
              <ul className="mb-4 divide-y divide-slate-100">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                    <div>
                      <div className="font-medium">{rupees(p.net_amount)} in bank{Number(p.tds_amount) > 0 && <span className="font-normal text-slate-500"> + {rupees(p.tds_amount)} TDS</span>}</div>
                      <div className="text-xs text-slate-500">
                        {fmtDate(p.received_date)}
                        {p.mode ? ` · ${p.mode}` : ""}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </div>
                    </div>
                    <ConfirmButton action={deletePayment.bind(null, p.id)} confirmText="Delete this payment?" className="text-xs text-rose-500 hover:underline">
                      Delete
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            )}
            {live && balance > 0 ? (
              <PaymentForm invoiceId={inv.id} expectedNet={round2(balance - expectedTds)} expectedTds={expectedTds} tdsSection={inv.tds_section} today={today} />
            ) : live ? (
              <p className="text-sm text-emerald-700">✓ Fully paid{inv.paid_at ? ` on ${fmtDate(inv.paid_at)}` : ""}.</p>
            ) : (
              <Empty>This invoice is cancelled.</Empty>
            )}
          </Card>

          <Card title="Status">
            <div className="flex flex-wrap gap-2">
              {inv.status === "draft" && (
                <form action={markInvoiceSent.bind(null, inv.id)}>
                  <button className="btn-secondary">Mark as sent</button>
                </form>
              )}
              {live ? (
                <ConfirmButton action={cancelInvoice.bind(null, inv.id)} confirmText="Cancel this invoice? It stays in your records, marked Cancelled." className="btn-secondary">
                  Cancel invoice
                </ConfirmButton>
              ) : (
                <form action={reopenInvoice.bind(null, inv.id)}>
                  <button className="btn-secondary">Reopen</button>
                </form>
              )}
              {inv.payments.length === 0 && (
                <ConfirmButton action={deleteInvoice.bind(null, inv.id)} confirmText="Delete this invoice permanently?">
                  Delete
                </ConfirmButton>
              )}
            </div>
            {inv.sent_at && <p className="mt-3 text-xs text-slate-500">Sent {fmtDateTime(inv.sent_at)}</p>}
            {emails && emails.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                {emails.map((e) => (
                  <li key={e.id}>
                    {e.status === "sent" ? "✉️" : "⚠️"} {fmtDateTime(e.created_at)} → {e.to_addresses}
                    {e.status === "failed" && <span className="text-rose-600"> (failed)</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-slate-500"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
