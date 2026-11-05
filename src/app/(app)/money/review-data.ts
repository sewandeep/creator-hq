import "server-only";
import type { DB } from "@/app/actions/helpers";
import { suggestPattern } from "@/lib/finance/categorize";
import type { Category } from "@/lib/finance/categories-server";
import type { ReviewTxn } from "./review-card";

// The categories people use most, shown as one-tap buttons — by direction.
const QUICK_OUT = ["Food & dining", "Groceries", "Fuel", "Travel & cabs", "Shopping", "Studio & equipment", "EMI & loans", "Family", "Lent money", "Paid back a loan", "Self transfer", "Pass-through", "Other spending"];
const QUICK_IN = ["Creator income", "Freelance income", "Sajilo income", "Sajilo reimbursements", "Other income", "Family", "Money returned", "Borrowed", "Refunds & cashback", "Self transfer", "Pass-through"];

/** Transactions waiting for you, ready for the sort cards. */
export async function loadReviewItems(supabase: DB, categories: Category[], limit: number) {
  const { data, count } = await supabase
    .from("transactions")
    .select("id, txn_date, amount, direction, description, counterparty, upi_id, source, category_id, category_reason, review_reason, note, person, account:bank_accounts(name), invoice:invoices!transactions_suggested_invoice_id_fkey(id, invoice_number, status, brand:brands(name))", { count: "exact" })
    .eq("needs_review", true)
    .order("txn_date", { ascending: false })
    .limit(limit);
  const pick = (names: string[]) => names.map((n) => categories.find((c) => c.name === n)).filter((c): c is Category => Boolean(c));
  const quickOut = pick(QUICK_OUT);
  const quickIn = pick(QUICK_IN);
  const items = (data ?? []).map((t) => ({
    quick: t.direction === "credit" ? quickIn : quickOut,
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
    } satisfies ReviewTxn,
  }));
  return { items, count: count ?? 0 };
}
