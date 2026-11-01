import "server-only";
import type { DB } from "@/app/actions/helpers";
import type { InvoicePdfData } from "./invoice-pdf";

/** Everything needed to show, print or email one invoice. */
export async function loadInvoice(supabase: DB, id: string) {
  const [{ data: invoice, error }, { data: profile }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, brand:brands(id, name), deal:deals(id, title, stage), items:invoice_items(*), payments(*)")
      .eq("id", id)
      .order("position", { referencedTable: "invoice_items" })
      .order("received_date", { referencedTable: "payments" })
      .maybeSingle(),
    supabase.from("profile").select("*").maybeSingle(),
  ]);
  if (error) throw error;
  if (!invoice) return null;

  const pdf: InvoicePdfData = {
    invoice_number: invoice.invoice_number,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    bill_to_name: invoice.bill_to_name,
    bill_to_address: invoice.bill_to_address,
    bill_to_gstin: invoice.bill_to_gstin,
    bill_to_pan: invoice.bill_to_pan,
    notes: invoice.notes,
    subtotal: Number(invoice.subtotal),
    tds_rate: invoice.tds_rate === null ? null : Number(invoice.tds_rate),
    tds_section: invoice.tds_section,
    status: invoice.status,
    items: invoice.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      rate: Number(i.rate),
      amount: Number(i.amount),
    })),
    from: {
      name: profile?.legal_name || profile?.display_name || "Your name (add it in Settings)",
      pan: profile?.pan ?? null,
      address: profile?.address ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      bank_account_name: profile?.bank_account_name ?? null,
      bank_name: profile?.bank_name ?? null,
      bank_account_number: profile?.bank_account_number ?? null,
      bank_ifsc: profile?.bank_ifsc ?? null,
      upi_id: profile?.upi_id ?? null,
      footer: profile?.invoice_footer ?? null,
    },
  };
  const paid = invoice.payments.reduce((t, p) => t + Number(p.gross_amount), 0);
  const tdsCut = invoice.payments.reduce((t, p) => t + Number(p.tds_amount), 0);
  return { invoice, profile, pdf, paid, tdsCut, balance: Math.max(0, Number(invoice.subtotal) - paid) };
}
