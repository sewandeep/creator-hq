import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Emails" };

export default async function EmailPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("email_log")
    .select("id, to_addresses, subject, status, error, attachment_name, created_at, deal:deals(id, title), brand:brands(id, name), invoice:invoices(id, invoice_number)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <>
      <PageHeader
        title="Emails"
        subtitle={isEmailConfigured() ? "Everything sent from Creator HQ." : "Direct sending isn't connected yet — see Settings."}
        actions={
          <>
            <Link href="/email/templates" className="btn-secondary">Templates</Link>
            <Link href="/email/compose" className="btn-primary">+ New email</Link>
          </>
        }
      />
      {!data?.length ? (
        <Empty>
          No emails sent yet. Open a deal or invoice and use <b>Email brand</b>.
        </Empty>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {data.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{e.subject}</div>
                  <div className="truncate text-xs text-slate-500">
                    To {e.to_addresses}
                    {e.brand && <> · <Link href={`/brands/${e.brand.id}`} className="hover:underline">{e.brand.name}</Link></>}
                    {e.deal && <> · <Link href={`/deals/${e.deal.id}`} className="hover:underline">{e.deal.title}</Link></>}
                    {e.invoice && <> · <Link href={`/invoices/${e.invoice.id}`} className="hover:underline">📎 {e.invoice.invoice_number}</Link></>}
                  </div>
                  {e.error && <div className="text-xs text-rose-600">{e.error}</div>}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {fmtDateTime(e.created_at)}
                  <Badge tone={e.status === "sent" ? "green" : "red"}>{e.status === "sent" ? "Sent" : "Failed"}</Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
