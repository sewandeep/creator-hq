import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { suggestPattern } from "@/lib/finance/categorize";
import { ensureCategories } from "@/lib/finance/categories-server";
import { ReviewList } from "../review-card";

export const metadata: Metadata = { title: "Review" };

// The categories people use most, shown as one-tap buttons.
const QUICK = ["Food & dining", "Groceries", "Travel & cabs", "Shopping", "Family", "Rent", "Bills & utilities", "Lent money", "Money returned", "Self transfer", "Creator work expenses", "Other spending"];

export default async function ReviewPage() {
  const { supabase } = await requireUser();
  const categories = await ensureCategories(supabase);
  const { data, count } = await supabase
    .from("transactions")
    .select("id, txn_date, amount, direction, description, counterparty, upi_id, source, category_id, category_reason, review_reason, note, person, account:bank_accounts(name), invoice:invoices!transactions_suggested_invoice_id_fkey(id, invoice_number, status, brand:brands(name))", { count: "exact" })
    .eq("needs_review", true)
    .order("txn_date", { ascending: false })
    .limit(30);

  const quick = QUICK.map((n) => categories.find((c) => c.name === n)).filter((c): c is (typeof categories)[number] => Boolean(c));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Needs you"
        subtitle={count ? `${count} transaction${count === 1 ? "" : "s"} the AI wasn't sure about. Tell it once — tick "Always use" and it remembers.` : "All caught up."}
        actions={<Link href="/money" className="btn-secondary">Back to Money</Link>}
      />
      {!data?.length ? (
        <Empty action={<Link href="/money/upload" className="btn-secondary">Upload a statement</Link>}>Nothing to review. 🎉</Empty>
      ) : (
        <div className="space-y-3">
          <ReviewList
            categories={categories}
            items={data.map((t) => ({
              quick: t.direction === "credit" ? categories.filter((c) => c.kind === "income" || c.name === "Money returned" || c.name === "Self transfer") : quick,
              t: {
                id: t.id,
                txn_date: t.txn_date,
                amount: Number(t.amount),
                direction: t.direction as "debit" | "credit",
                description: t.description,
                counterparty: t.counterparty,
                account: t.account?.name ?? null,
                source: t.source,
                category_id: t.category_id,
                category_reason: t.category_reason,
                review_reason: t.review_reason,
                note: t.note,
                person: t.person,
                pattern: suggestPattern(t),
                invoice: t.invoice && !["paid", "cancelled"].includes(t.invoice.status) ? { id: t.invoice.id, number: t.invoice.invoice_number, brand: t.invoice.brand?.name ?? "" } : null,
              },
            }))}
          />
          {(count ?? 0) > data.length && <p className="text-center text-sm text-slate-500">Showing 30 at a time — reload for the next batch.</p>}
        </div>
      )}
    </div>
  );
}
