"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addDays, rupees, todayIST } from "@/lib/format";
import { FormError, date, money, requiredText, text, toActionError, type ActionState } from "@/lib/forms";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import { round2 } from "@/lib/money";
import { refreshAll, type DB } from "./helpers";

type Item = { description: string; quantity: number; rate: number };

function readItems(fd: FormData): Item[] {
  const desc = fd.getAll("item_description").map(String);
  const qty = fd.getAll("item_quantity").map(String);
  const rate = fd.getAll("item_rate").map(String);
  const items: Item[] = [];
  desc.forEach((d, i) => {
    const description = d.trim();
    const q = Number((qty[i] ?? "1").replace(/,/g, "")) || 0;
    const r = Number((rate[i] ?? "").replace(/[₹,\s]/g, ""));
    if (!description && !rate[i]?.trim()) return; // empty row
    if (!description) throw new FormError(`Line ${i + 1} needs a description.`);
    if (!(q > 0)) throw new FormError(`Line ${i + 1}: quantity must be more than 0.`);
    if (!Number.isFinite(r) || r < 0) throw new FormError(`Line ${i + 1}: "${rate[i]}" isn't a valid rate.`);
    items.push({ description, quantity: q, rate: round2(r) });
  });
  if (!items.length) throw new FormError("Add at least one line item.");
  return items;
}

function header(fd: FormData) {
  const tdsRate = money(fd, "tds_rate");
  if (tdsRate !== null && tdsRate > 100) throw new FormError("TDS rate can't be more than 100%.");
  return {
    brand_id: requiredText(fd, "brand_id", "Brand"),
    deal_id: text(fd, "deal_id"),
    issue_date: date(fd, "issue_date") ?? todayIST(),
    due_date: date(fd, "due_date"),
    bill_to_name: requiredText(fd, "bill_to_name", "Bill-to name"),
    bill_to_address: text(fd, "bill_to_address"),
    bill_to_gstin: text(fd, "bill_to_gstin")?.toUpperCase() ?? null,
    bill_to_pan: text(fd, "bill_to_pan")?.toUpperCase() ?? null,
    tds_rate: tdsRate,
    tds_section: text(fd, "tds_section"),
    notes: text(fd, "notes"),
  };
}

async function replaceItems(supabase: DB, invoiceId: string, items: Item[]) {
  const { error: delError } = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
  if (delError) throw delError;
  const { error } = await supabase
    .from("invoice_items")
    .insert(items.map((it, position) => ({ invoice_id: invoiceId, position, ...it })));
  if (error) throw error;
}

export async function createInvoice(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  let id: string;
  try {
    const h = header(fd);
    const items = readItems(fd);
    const { data: profile } = await supabase.from("profile").select("invoice_prefix, payment_terms_days").maybeSingle();
    const num = await nextInvoiceNumber(supabase, profile?.invoice_prefix ?? "INV", h.issue_date);
    const custom = text(fd, "invoice_number");

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        ...h,
        due_date: h.due_date ?? addDays(h.issue_date, profile?.payment_terms_days ?? 15),
        fy: num.fy,
        seq: num.seq,
        invoice_number: custom ?? num.number,
      })
      .select("id, invoice_number")
      .single();
    if (error) {
      if (error.message.includes("invoices_user_id_invoice_number_key")) throw new FormError("That invoice number is already used.");
      throw error;
    }
    id = data.id;
    await replaceItems(supabase, id, items);

    const total = items.reduce((t, it) => t + it.quantity * it.rate, 0);
    await supabase.from("activities").insert({
      deal_id: h.deal_id,
      brand_id: h.brand_id,
      kind: "invoice",
      body: `Invoice ${data.invoice_number} created for ${rupees(total)}`,
    });
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  redirect(`/invoices/${id}`);
}

export async function updateInvoice(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const h = header(fd);
    const items = readItems(fd);
    const number = requiredText(fd, "invoice_number", "Invoice number");
    const { error } = await supabase.from("invoices").update({ ...h, invoice_number: number }).eq("id", id);
    if (error) {
      if (error.message.includes("invoices_user_id_invoice_number_key")) throw new FormError("That invoice number is already used.");
      throw error;
    }
    await replaceItems(supabase, id, items);
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  redirect(`/invoices/${id}`);
}

/** Marks the invoice as sent and moves its deal to "Invoiced" if it was earlier in the pipeline. */
export async function markInvoiceSent(id: string) {
  const { supabase } = await requireUser();
  await markSent(supabase, id);
  refreshAll();
}

export async function markSent(supabase: DB, id: string) {
  const { data: inv, error } = await supabase.from("invoices").select("id, sent_at, status, deal_id").eq("id", id).single();
  if (error) throw new Error(error.message);
  if (!inv.sent_at) {
    await supabase
      .from("invoices")
      .update({ sent_at: new Date().toISOString(), status: inv.status === "draft" ? "sent" : inv.status })
      .eq("id", id);
  }
  if (inv.deal_id) {
    await supabase
      .from("deals")
      .update({ stage: "invoiced" })
      .eq("id", inv.deal_id)
      .in("stage", ["lead", "contacted", "negotiating", "confirmed", "in_progress", "posted"]);
  }
}

export async function cancelInvoice(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", id);
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function reopenInvoice(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("invoices").update({ status: "draft" }).eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.rpc("refresh_invoice", { p_invoice: id });
  refreshAll();
}

export async function deleteInvoice(id: string) {
  const { supabase } = await requireUser();
  const { count } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("invoice_id", id);
  if (count) throw new Error("This invoice has payments. Delete those first, or cancel the invoice instead.");
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshAll();
  redirect("/invoices");
}
