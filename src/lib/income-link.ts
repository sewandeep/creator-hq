import "server-only";
import { findOrCreateBrand, type DB } from "@/app/actions/helpers";
import { ensureCategories } from "@/lib/finance/categories-server";
import { logChange } from "@/lib/finance/entries";
import { rupees } from "@/lib/format";
import { createDraftInvoiceFromDeal } from "@/lib/invoice-draft";
import { round2 } from "@/lib/money";

// Connecting money that reached your bank to your brand work:
// bank line ↔ payment ↔ invoice ↔ deal. Each step keeps TDS straight:
// what arrived + TDS the brand cut = the invoice amount.

/** Records a bank credit as (part) payment of an invoice. */
export async function linkTxnToInvoice(supabase: DB, transactionId: string, invoiceId: string) {
  const { data: t } = await supabase.from("transactions").select("id, amount, txn_date, reference, category_id, payment_id").eq("id", transactionId).single();
  const { data: inv } = await supabase.from("invoices").select("id, brand_id, deal_id, subtotal, tds_rate, tds_section, payments(gross_amount)").eq("id", invoiceId).single();
  if (!t || !inv) throw new Error("Not found.");
  if (t.payment_id) throw new Error("This is already recorded as a payment.");
  const balance = round2(Number(inv.subtotal) - inv.payments.reduce((s, p) => s + Number(p.gross_amount), 0));
  const net = Number(t.amount);
  const expectedNet = round2(balance - (balance * Number(inv.tds_rate ?? 0)) / 100);
  // If what arrived equals "balance minus TDS", the rest is TDS. Otherwise treat it as a plain part-payment.
  const tds = Math.abs(net - expectedNet) <= 1 ? round2(balance - net) : 0;

  const { data: pay, error } = await supabase
    .from("payments")
    .insert({ brand_id: inv.brand_id, invoice_id: inv.id, deal_id: inv.deal_id, received_date: t.txn_date, gross_amount: round2(net + tds), tds_amount: tds, tds_section: tds ? inv.tds_section : null, mode: "Bank transfer", reference: t.reference, notes: "Recorded from bank statement" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const categories = await ensureCategories(supabase);
  const income = categories.find((c) => c.name === "Creator income");
  await supabase
    .from("transactions")
    .update({ payment_id: pay.id, suggested_invoice_id: null, needs_review: false, review_reason: null, category_id: income?.id ?? t.category_id, category_source: "user", category_reason: "Linked to an invoice payment" })
    .eq("id", t.id);
  await logChange(supabase, t.id, "linked", null, "recorded as invoice payment", "user");
  await supabase.from("activities").insert({ deal_id: inv.deal_id, brand_id: inv.brand_id, kind: "payment", body: `Payment received: ${rupees(net)} in bank${tds ? ` (+ ${rupees(tds)} TDS)` : ""} — from bank statement` });

  const { data: after } = await supabase.from("invoices").select("status, deal_id").eq("id", inv.id).single();
  if (after?.status === "paid") {
    // Other bank lines that pointed at this invoice no longer can be its payment.
    await supabase
      .from("transactions")
      .update({ suggested_invoice_id: null, review_reason: "Looks like brand money — is this another payment, or something else?" })
      .eq("suggested_invoice_id", inv.id)
      .neq("id", t.id);
  }
  if (after?.status === "paid" && after.deal_id) await supabase.from("deals").update({ stage: "paid", next_follow_up: null }).eq("id", after.deal_id).neq("stage", "paid");
  return { paymentId: pay.id, tds };
}

/** The fee before TDS, from what reached the bank (₹27,000 after 10% TDS → ₹30,000). */
export const grossFromNet = (net: number, tdsRate: number) => (tdsRate > 0 ? Math.round(net / (1 - tdsRate / 100)) : round2(net));

/** Links a bank credit to a deal: to its open invoice, or a new invoice for it. */
export async function linkTxnToDeal(supabase: DB, transactionId: string, dealId: string, tdsRate: number) {
  const { data: t } = await supabase.from("transactions").select("amount, txn_date").eq("id", transactionId).single();
  const { data: deal } = await supabase.from("deals").select("id, amount, invoices(id, status)").eq("id", dealId).single();
  if (!t || !deal) throw new Error("Not found.");
  const open = deal.invoices.find((i) => ["sent", "partially_paid", "draft"].includes(i.status));
  if (open) return linkTxnToInvoice(supabase, transactionId, open.id);
  if (!deal.amount) await supabase.from("deals").update({ amount: grossFromNet(Number(t.amount), tdsRate) }).eq("id", dealId);
  const inv = await createDraftInvoiceFromDeal(supabase, dealId, "from a bank payment");
  await supabase.from("invoices").update({ status: "sent", tds_rate: tdsRate, tds_section: tdsRate === 2 ? "194C" : tdsRate ? "194J" : null, issue_date: t.txn_date, due_date: t.txn_date }).eq("id", inv.id);
  return linkTxnToInvoice(supabase, transactionId, inv.id);
}

/** Money that came in with no deal yet: create brand + deal + invoice and mark it paid, in one go. */
export async function createPaidDealFromTxn(supabase: DB, transactionId: string, o: { brand: string; title?: string; tdsRate: number }) {
  const { data: t } = await supabase.from("transactions").select("amount, txn_date, counterparty, note").eq("id", transactionId).single();
  if (!t) throw new Error("Not found.");
  const brandId = await findOrCreateBrand(supabase, o.brand.trim() || t.counterparty || "Brand");
  const gross = grossFromNet(Number(t.amount), o.tdsRate);
  const { data: deal, error } = await supabase
    .from("deals")
    .insert({ brand_id: brandId, title: (o.title?.trim() || t.note || `Collab — ${t.txn_date}`).slice(0, 120), stage: "invoiced", amount: gross, deal_date: t.txn_date, source: "other" })
    .select("id")
    .single();
  if (error || !deal) throw new Error(error?.message ?? "Couldn't create the deal.");
  const r = await linkTxnToDeal(supabase, transactionId, deal.id, o.tdsRate);
  return { ...r, dealId: deal.id };
}
