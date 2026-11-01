import type { Metadata } from "next";
import Link from "next/link";
import { createInvoice } from "@/app/actions/invoices";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { addDays, todayIST } from "@/lib/format";
import { itemsFromDeal } from "@/lib/invoice-draft";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import { InvoiceForm, type ItemRow } from "../invoice-form";
import { loadInvoiceFormOptions } from "../form-data";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ deal?: string; brand?: string }> }) {
  const { deal: dealId, brand: brandParam } = await searchParams;
  const { supabase } = await requireUser();
  const { brands, deals, profile } = await loadInvoiceFormOptions(supabase);
  const today = todayIST();
  const next = await nextInvoiceNumber(supabase, profile?.invoice_prefix ?? "INV", today);

  // Starting from a deal: fill in brand, deal and line items from its deliverables.
  let items: ItemRow[] = [];
  let brandId = brandParam ?? "";
  if (dealId) {
    const prepared = await itemsFromDeal(supabase, dealId);
    if (prepared) {
      brandId = prepared.deal.brand_id;
      items = prepared.items;
    }
  }
  const brand = brands.find((b) => b.id === brandId);
  const missingProfile = !profile?.legal_name || !profile?.pan;

  return (
    <div className="max-w-4xl">
      <PageHeader title="New invoice" subtitle={`Next number: ${next.number}`} />
      {missingProfile && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your name and PAN aren&apos;t set yet, so they won&apos;t show on the invoice.{" "}
          <Link href="/settings" className="font-medium underline">Add them in Settings</Link>.
        </p>
      )}
      <InvoiceForm
        action={createInvoice}
        brands={brands}
        deals={deals}
        mode="create"
        numberPlaceholder={next.number}
        submitLabel="Create invoice"
        defaults={{
          brand_id: brandId,
          deal_id: dealId ?? "",
          invoice_number: "",
          issue_date: today,
          due_date: addDays(today, profile?.payment_terms_days ?? 15),
          bill_to_name: brand ? brand.legal_name || brand.name : "",
          bill_to_address: brand?.billing_address ?? "",
          bill_to_gstin: brand?.gstin ?? "",
          bill_to_pan: brand?.pan ?? "",
          tds_rate: String(profile?.default_tds_rate ?? 10),
          tds_section: profile?.default_tds_section ?? "194J",
          notes: "",
          items,
        }}
      />
    </div>
  );
}
