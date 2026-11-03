import type { Metadata } from "next";
import { Tap } from "@/components/tap";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEntry, dismissInvoiceSuggestion, recordAsInvoicePayment, saveTxnDetails, unlinkEntry } from "@/app/actions/finance";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { suggestPattern } from "@/lib/finance/categorize";
import { ensureCategories } from "@/lib/finance/categories-server";
import { fmtDate, fmtDateTime, rupees } from "@/lib/format";
import { CategoryEditor, RestoreButton } from "./editor";

export const metadata: Metadata = { title: "Transaction" };

const SOURCE_LABEL: Record<string, string> = { ai: "AI", rule: "Your rule", user: "You", match: "Matched entry", system: "System" };

export default async function TxnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const categories = await ensureCategories(supabase);
  const { data: t } = await supabase
    .from("transactions")
    .select("*, category:categories(id, name, emoji, kind), account:bank_accounts(id, name), statement:statements(id, file_name), invoice:invoices!transactions_suggested_invoice_id_fkey(id, invoice_number, brand:brands(name)), payment:payments(id, invoice_id, gross_amount, tds_amount)")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  const [{ data: changes }, { data: linkedEntries }, { data: matchedTo }] = await Promise.all([
    supabase.from("transaction_changes").select("*").eq("transaction_id", id).order("created_at", { ascending: false }),
    supabase.from("transactions").select("id, description, txn_date").eq("matched_txn_id", id),
    t.matched_txn_id ? supabase.from("transactions").select("id, description, txn_date, account:bank_accounts(name)").eq("id", t.matched_txn_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const catByName = new Map(categories.map((c) => [c.name, c.id]));
  const manual = t.source !== "statement";

  return (
    <div className="max-w-3xl">
      <div className="mb-2 text-sm">
        <Link href={`/money/transactions?month=${t.txn_date.slice(0, 7)}`} className="text-slate-500 hover:underline">Transactions</Link>
      </div>
      <PageHeader
        title={
          <span className={t.direction === "credit" ? "text-emerald-700" : ""}>
            {t.direction === "debit" ? "−" : "+"}{rupees(t.amount)} · {t.counterparty || t.note || t.description}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {fmtDate(t.txn_date)}
            <span>· {t.source === "statement" ? t.account?.name ?? "Bank" : t.source === "telegram" ? "From Telegram" : "Typed by you"}</span>
            {t.is_cash && <Badge tone="amber">Cash</Badge>}
            {t.needs_review && <Badge tone="amber">Needs review</Badge>}
          </span>
        }
      />

      <div className="space-y-6">
        <Card title="What was it?">
          <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div>
              Category: <b>{t.category ? `${t.category.emoji ?? ""} ${t.category.name}` : "Not set"}</b>
            </div>
            {t.category_reason && <div className="mt-0.5 text-slate-600">Why: {t.category_reason}</div>}
            {t.review_reason && t.needs_review && <div className="mt-0.5 text-amber-800">{t.review_reason}</div>}
          </div>
          <CategoryEditor t={t} categories={categories} defaultPattern={suggestPattern(t)} />
        </Card>

        {t.invoice && !t.payment && (
          <Card title="Brand payment?">
            <p className="text-sm">
              This looks like the payment for <Link href={`/invoices/${t.invoice.id}`} className="link">{t.invoice.invoice_number}</Link> from {t.invoice.brand?.name}.
            </p>
            <div className="mt-3 flex gap-2">
              <Tap action={recordAsInvoicePayment.bind(null, t.id, t.invoice.id)} className="btn-primary" done="Recorded ✓" saved="Payment recorded">Record payment on the invoice</Tap>
              <Tap action={dismissInvoiceSuggestion.bind(null, t.id)} className="btn-ghost" done="OK" saved="">Not this invoice</Tap>
            </div>
          </Card>
        )}
        {t.payment && (
          <p className="text-sm text-emerald-700">
            ✓ Recorded as a payment{t.payment.invoice_id ? <> on <Link href={`/invoices/${t.payment.invoice_id}`} className="link">the invoice</Link></> : ""}.
          </p>
        )}

        <Card title="From the bank">
          <dl className="space-y-1.5 text-sm">
            <Row label="Narration" value={t.description} />
            {t.counterparty && <Row label="Payee" value={t.counterparty} />}
            {t.upi_id && <Row label="UPI ID" value={t.upi_id} />}
            {t.reference && <Row label="Reference" value={t.reference} />}
            {t.balance !== null && <Row label="Balance after" value={rupees(t.balance)} />}
            {t.statement && <Row label="Statement" value={<Link href="/money/statements" className="link">{t.statement.file_name}</Link>} />}
          </dl>
          {linkedEntries?.length ? (
            <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
              Your entr{linkedEntries.length === 1 ? "y" : "ies"} matched to this:
              <ul className="mt-1 space-y-1">
                {linkedEntries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <Link href={`/money/transactions/${e.id}`} className="link">“{e.description}” · {fmtDate(e.txn_date, true)}</Link>
                    <form action={unlinkEntry.bind(null, e.id)}><button className="text-xs text-slate-500 hover:underline">Unlink</button></form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {matchedTo && (
            <p className="mt-3 border-t border-slate-100 pt-3 text-sm">
              Matched to the bank entry{" "}
              <Link href={`/money/transactions/${matchedTo.id}`} className="link">“{matchedTo.description}”</Link> on {fmtDate(matchedTo.txn_date, true)}
              {matchedTo.account ? ` (${matchedTo.account.name})` : ""} — only that one is counted.{" "}
              <form action={unlinkEntry.bind(null, t.id)} className="inline"><button className="text-xs text-slate-500 hover:underline">Unlink</button></form>
            </p>
          )}
        </Card>

        {manual && (
          <Card title="Edit your entry">
            <ActionForm action={saveTxnDetails.bind(null, t.id)} className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2"><span className="label">What was it</span><input name="description" defaultValue={t.description} className="input" /></label>
              <label className="block"><span className="label">Amount (₹)</span><input name="amount" defaultValue={String(t.amount)} inputMode="decimal" className="input" /></label>
              <label className="block"><span className="label">Date</span><input name="txn_date" type="date" defaultValue={t.txn_date} className="input" /></label>
              <input type="hidden" name="note" value={t.note ?? ""} />
              <input type="hidden" name="person" value={t.person ?? ""} />
              <div className="flex items-center gap-2 sm:col-span-2">
                <SubmitButton>Save</SubmitButton>
              </div>
            </ActionForm>
            <div className="mt-3">
              <ConfirmButton action={deleteEntry.bind(null, t.id)} confirmText="Delete this entry?">Delete entry</ConfirmButton>
            </div>
          </Card>
        )}

        <Card title="History">
          {changes?.length ? (
            <ol className="space-y-2 text-sm">
              {changes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="text-xs text-slate-500">{fmtDateTime(c.created_at)} · {SOURCE_LABEL[c.source] ?? c.source}</span>{" "}
                    {c.field === "category"
                      ? <>category {c.old_value ? <>“{c.old_value}” → </> : "set to "}“{c.new_value ?? "none"}”</>
                      : c.field === "reviewed"
                        ? c.new_value
                        : c.field === "matched" || c.field === "linked"
                          ? <>{c.field} to {c.new_value}</>
                          : <>{c.field}: “{c.old_value ?? ""}” → “{c.new_value ?? ""}”</>}
                  </span>
                  {c.field === "category" && c.old_value && catByName.has(c.old_value) && c.old_value !== t.category?.name && (
                    <RestoreButton transactionId={t.id} categoryId={catByName.get(c.old_value)!} label={c.old_value} />
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">No changes yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 break-words">{value}</dd>
    </div>
  );
}
