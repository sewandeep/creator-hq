import type { Metadata } from "next";
import Link from "next/link";
import { deleteAccount, deleteStatement } from "@/app/actions/finance";
import { ConfirmButton } from "@/components/forms";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, rupees } from "@/lib/format";
import { AccountForm, EditAccount, RetryStatement } from "./account-form";

export const metadata: Metadata = { title: "Accounts & statements" };

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
  done: { label: "Read", tone: "green" },
  processing: { label: "Reading…", tone: "slate" },
  uploaded: { label: "Uploaded", tone: "slate" },
  needs_password: { label: "Needs password", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
};

export default async function StatementsPage() {
  const { supabase } = await requireUser();
  const [{ data: accounts }, { data: statements }] = await Promise.all([
    supabase.from("bank_accounts").select("id, name, bank, last4, pdf_password").order("created_at"),
    supabase.from("statements").select("*, account:bank_accounts(name)").order("created_at", { ascending: false }),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Accounts & statements" actions={<Link href="/money/upload" className="btn-primary">Upload statement</Link>} />

      <Card title="Bank accounts">
        {accounts?.length ? (
          <ul className="mb-4 divide-y divide-slate-100">
            {accounts.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-slate-500">
                      {a.bank.toUpperCase()}
                      {a.last4 ? ` · ••••${a.last4}` : ""}
                      {a.pdf_password ? " · PDF password saved" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <EditAccount account={{ id: a.id, name: a.name, bank: a.bank, last4: a.last4, hasPassword: Boolean(a.pdf_password) }} />
                    <ConfirmButton action={deleteAccount.bind(null, a.id)} confirmText={`Delete ${a.name}, all its statements and every transaction read from them?`} className="text-xs text-rose-500 hover:underline">
                      Delete
                    </ConfirmButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <details open={!accounts?.length}>
          <summary className="cursor-pointer text-sm font-medium text-brand-600">+ Add an account</summary>
          <div className="mt-3"><AccountForm /></div>
        </details>
      </Card>

      <Card title="Uploaded statements">
        {statements?.length ? (
          <ul className="divide-y divide-slate-100">
            {statements.map((s) => {
              const st = STATUS[s.status] ?? STATUS.uploaded;
              const issues = Array.isArray(s.issues) ? (s.issues as string[]) : [];
              return (
                <li key={s.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {s.account?.name} · {s.period_from ? `${fmtDate(s.period_from, true)} – ${fmtDate(s.period_to)}` : s.file_name}
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {s.status === "done" && (s.balance_ok ? <Badge tone="green">Balances ✓</Badge> : <Badge tone="amber">Check balances</Badge>)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {s.file_name} · uploaded {fmtDateTime(s.created_at)}
                        {s.status === "done" && ` · ${s.rows_found} rows, ${s.rows_added} new${s.rows_duplicate ? `, ${s.rows_duplicate} already had` : ""}`}
                        {s.opening_balance !== null && ` · ${rupees(s.opening_balance)} → ${rupees(s.closing_balance)}`}
                      </div>
                      {s.error && <div className="text-xs text-rose-600">{s.error}</div>}
                      {issues.map((i) => <div key={i} className="text-xs text-amber-800">⚠ {i}</div>)}
                      {["failed", "needs_password", "uploaded", "processing"].includes(s.status) && <RetryStatement id={s.id} needsPassword={s.status === "needs_password"} />}
                    </div>
                    <div className="flex items-center gap-3">
                      {s.status === "done" && s.period_from && (
                        <Link href={`/money/transactions?month=${s.period_from.slice(0, 7)}&account=${s.account_id}`} className="text-xs text-brand-600 hover:underline">View</Link>
                      )}
                      <ConfirmButton action={deleteStatement.bind(null, s.id)} confirmText="Delete this statement and the transactions read from it? (Upload it again any time.)" className="text-xs text-rose-500 hover:underline">
                        Delete
                      </ConfirmButton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty action={<Link href="/money/upload" className="btn-primary">Upload your first statement</Link>}>No statements yet.</Empty>
        )}
      </Card>
    </div>
  );
}
