import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { emailConfig } from "@/lib/email";
import { daysBetween, fmtDate, rupees, todayIST } from "@/lib/format";
import { invoiceFileName } from "@/lib/invoice-pdf";
import { ensureDefaultTemplates } from "@/lib/templates-server";
import type { TemplateVars } from "@/lib/templates";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "New email" };

type Search = { deal?: string; invoice?: string; brand?: string; template?: string };

export default async function ComposePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  await ensureDefaultTemplates(supabase);
  const today = todayIST();

  const invoice = sp.invoice
    ? (await supabase.from("invoices").select("id, invoice_number, subtotal, due_date, brand_id, deal_id, status").eq("id", sp.invoice).maybeSingle()).data
    : null;
  const dealId = invoice?.deal_id ?? sp.deal ?? null;
  const deal = dealId
    ? (await supabase.from("deals").select("id, title, amount, brand_id, contact:contacts(name, email)").eq("id", dealId).maybeSingle()).data
    : null;
  const brandId = invoice?.brand_id ?? deal?.brand_id ?? sp.brand ?? null;

  const [{ data: brand }, { data: contacts }, { data: templates }, { data: profile }] = await Promise.all([
    brandId ? supabase.from("brands").select("id, name").eq("id", brandId).maybeSingle() : Promise.resolve({ data: null }),
    brandId ? supabase.from("contacts").select("name, email").eq("brand_id", brandId).not("email", "is", null).order("name") : Promise.resolve({ data: [] }),
    supabase.from("email_templates").select("id, name, subject, body, attach_invoice").order("position").order("created_at"),
    supabase.from("profile").select("display_name, legal_name, phone").maybeSingle(),
  ]);

  const vars: TemplateVars = {
    brand: brand?.name,
    deal: deal?.title,
    deal_amount: deal?.amount ? rupees(deal.amount) : undefined,
    invoice_number: invoice?.invoice_number,
    invoice_amount: invoice ? rupees(invoice.subtotal) : undefined,
    due_date: invoice?.due_date ? fmtDate(invoice.due_date) : undefined,
    days_overdue: invoice?.due_date && invoice.due_date < today ? String(daysBetween(invoice.due_date, today)) : undefined,
    my_name: profile?.display_name || profile?.legal_name || undefined,
    my_phone: profile?.phone ?? undefined,
  };
  if (!vars.deal) vars.deal = "our collaboration";

  const contactList = (contacts ?? []).filter((c): c is { name: string; email: string } => Boolean(c.email));
  const dealContact = deal?.contact?.email ? deal.contact : null;
  if (dealContact && !contactList.some((c) => c.email === dealContact.email)) contactList.unshift({ name: dealContact.name, email: dealContact.email! });
  const mail = emailConfig();
  const fromName = profile?.display_name || profile?.legal_name || "";
  const backHref = invoice ? `/invoices/${invoice.id}` : deal ? `/deals/${deal.id}` : brand ? `/brands/${brand.id}` : "/email";

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New email"
        subtitle={[brand?.name, deal?.title, invoice ? `Invoice ${invoice.invoice_number}` : null].filter(Boolean).join(" · ") || "Pick a template, check the preview, then send."}
      />
      <Composer
        templates={templates ?? []}
        baseVars={vars}
        contacts={contactList}
        defaultTo={dealContact?.email ?? contactList[0]?.email ?? ""}
        initialTemplate={sp.template ?? null}
        invoice={invoice ? { id: invoice.id, number: invoice.invoice_number, fileName: invoiceFileName(invoice.invoice_number) } : null}
        brandId={brandId}
        dealId={deal?.id ?? null}
        configured={Boolean(mail)}
        fromLine={mail ? `${fromName ? `${fromName} ` : ""}<${mail.user}>` : "Your Gmail"}
        backHref={backHref}
      />
    </div>
  );
}
