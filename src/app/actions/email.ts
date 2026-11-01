"use server";

import { requireUser } from "@/lib/auth";
import { isEmailConfigured, parseAddresses, sendMail } from "@/lib/email";
import { bool, requiredText, toActionError, type ActionState } from "@/lib/forms";
import { loadInvoice } from "@/lib/invoice-data";
import { invoiceFileName, renderInvoicePdf } from "@/lib/invoice-pdf";
import { refreshAll } from "./helpers";
import { markSent } from "./invoices";

export type SendResult = { ok?: boolean; error?: string };

export async function sendEmail(input: {
  to: string;
  cc: string;
  subject: string;
  body: string;
  brandId: string | null;
  dealId: string | null;
  invoiceId: string | null;
  attachInvoice: boolean;
}): Promise<SendResult> {
  const { supabase } = await requireUser();
  const to = parseAddresses(input.to);
  const cc = parseAddresses(input.cc);
  if (!to.ok.length) return { error: "Add at least one email address in To." };
  if (to.bad.length || cc.bad.length) return { error: `These don't look like email addresses: ${[...to.bad, ...cc.bad].join(", ")}` };
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) return { error: "Add a subject." };
  if (!body) return { error: "The email is empty." };
  if (subject.length > 300 || body.length > 20_000) return { error: "That email is too long." };
  if (!isEmailConfigured()) return { error: "Email sending isn't set up yet. See Settings → Email." };

  let attachmentName: string | null = null;
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  let brandId = input.brandId;
  let dealId = input.dealId;

  if (input.invoiceId && input.attachInvoice) {
    const inv = await loadInvoice(supabase, input.invoiceId);
    if (!inv) return { error: "Invoice not found." };
    attachmentName = invoiceFileName(inv.invoice.invoice_number);
    attachments.push({ filename: attachmentName, content: await renderInvoicePdf(inv.pdf), contentType: "application/pdf" });
    brandId = brandId ?? inv.invoice.brand_id;
    dealId = dealId ?? inv.invoice.deal_id;
  }

  const { data: profile } = await supabase.from("profile").select("display_name, legal_name").maybeSingle();
  const log = {
    brand_id: brandId,
    deal_id: dealId,
    invoice_id: input.invoiceId,
    to_addresses: to.ok.join(", "),
    cc_addresses: cc.ok.join(", ") || null,
    subject,
    body,
    attachment_name: attachmentName,
  };

  try {
    await sendMail({
      fromName: profile?.display_name || profile?.legal_name || "",
      to: to.ok,
      cc: cc.ok,
      subject,
      text: body,
      attachments,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("email_log").insert({ ...log, status: "failed", error: message.slice(0, 500) });
    const hint = /auth|login|credentials|535/i.test(message)
      ? " Gmail rejected the login — check the App Password in Vercel."
      : "";
    return { error: `Couldn't send: ${message}.${hint}` };
  }

  await supabase.from("email_log").insert({ ...log, status: "sent" });
  if (dealId || brandId) {
    await supabase.from("activities").insert({
      deal_id: dealId,
      brand_id: brandId,
      kind: "email",
      body: `Email sent to ${to.ok.join(", ")}: "${subject}"${attachmentName ? ` (with ${attachmentName})` : ""}`,
    });
  }
  if (input.invoiceId && input.attachInvoice) await markSent(supabase, input.invoiceId);
  refreshAll();
  return { ok: true };
}

export async function saveTemplate(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const row = {
      name: requiredText(fd, "name", "Template name"),
      subject: requiredText(fd, "subject", "Subject"),
      body: requiredText(fd, "body", "Email text"),
      attach_invoice: bool(fd, "attach_invoice"),
    };
    const { error } = id
      ? await supabase.from("email_templates").update(row).eq("id", id)
      : await supabase.from("email_templates").insert({ ...row, position: 999 });
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Template saved." };
}

export async function deleteTemplate(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("email_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshAll();
}
