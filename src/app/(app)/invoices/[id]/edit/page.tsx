import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateInvoice } from "@/app/actions/invoices";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { InvoiceForm } from "../../invoice-form";
import { loadInvoiceFormOptions } from "../../form-data";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: inv }, options] = await Promise.all([
    supabase.from("invoices").select("*, items:invoice_items(*)").eq("id", id).order("position", { referencedTable: "invoice_items" }).maybeSingle(),
    loadInvoiceFormOptions(supabase),
  ]);
  if (!inv) notFound();

  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit invoice ${inv.invoice_number}`} />
      <InvoiceForm
        action={updateInvoice.bind(null, id)}
        brands={options.brands}
        deals={options.deals}
        mode="edit"
        numberPlaceholder={inv.invoice_number}
        submitLabel="Save invoice"
        defaults={{
          brand_id: inv.brand_id,
          deal_id: inv.deal_id ?? "",
          invoice_number: inv.invoice_number,
          issue_date: inv.issue_date,
          due_date: inv.due_date ?? "",
          bill_to_name: inv.bill_to_name,
          bill_to_address: inv.bill_to_address ?? "",
          bill_to_gstin: inv.bill_to_gstin ?? "",
          bill_to_pan: inv.bill_to_pan ?? "",
          tds_rate: inv.tds_rate === null ? "" : String(inv.tds_rate),
          tds_section: inv.tds_section ?? "194J",
          notes: inv.notes ?? "",
          items: inv.items.map((i) => ({ description: i.description, quantity: String(i.quantity), rate: String(i.rate) })),
        }}
      />
    </div>
  );
}
