"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { STAGE_IDS, type StageId } from "@/lib/constants";
import { fmtDate, rupees, todayIST } from "@/lib/format";
import { parseDeliverables } from "@/lib/import";
import { round2 } from "@/lib/money";
import { findOrCreateBrand, refreshAll } from "./helpers";

// Small, one-tap actions for the Work screen.

const FIELDS = ["title", "amount", "due_date", "next_follow_up", "platform", "notes"] as const;
type Field = (typeof FIELDS)[number];

/** Edit one field of a deal in place. Returns an error message if the value doesn't make sense. */
export async function updateDealField(dealId: string, field: Field, raw: string): Promise<{ error?: string }> {
  if (!FIELDS.includes(field)) return { error: "Can't change that." };
  const { supabase } = await requireUser();
  const v = raw.trim();
  let value: string | number | null = v || null;
  if (field === "title" && !v) return { error: "The deal needs a name." };
  if (field === "amount" && v) {
    const m = v.toLowerCase().replace(/[₹,\s]|rs\.?/g, "").match(/^(\d+(?:\.\d+)?)(k|l)?$/);
    if (!m) return { error: `"${v}" isn't an amount — try 25000 or 25k.` };
    value = Number(m[1]) * (m[2] === "k" ? 1000 : m[2] === "l" ? 100000 : 1);
  }
  if ((field === "due_date" || field === "next_follow_up") && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: "Pick a date." };
  const patch =
    field === "amount" ? { amount: value as number | null }
    : field === "title" ? { title: String(value) }
    : field === "due_date" ? { due_date: value as string | null }
    : field === "next_follow_up" ? { next_follow_up: value as string | null }
    : field === "platform" ? { platform: value as string | null }
    : { notes: value as string | null };
  const { data: deal, error } = await supabase.from("deals").update(patch).eq("id", dealId).select("brand_id").single();
  if (error) return { error: error.message };
  if (field === "amount" || field === "due_date") {
    await supabase.from("activities").insert({ deal_id: dealId, brand_id: deal.brand_id, kind: "system", body: field === "amount" ? `Fee set to ${value === null ? "—" : rupees(value)}` : `Deadline set to ${value ? fmtDate(String(value)) : "none"}` });
  }
  refreshAll();
  return {};
}

/** "2 reels, 1 story" → content items on the deal. */
export async function addContent(dealId: string, text: string): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  const items = parseDeliverables(text);
  if (!items.length) return { error: 'Try something like "2 reels, 1 story".' };
  const { data: deal } = await supabase.from("deals").select("platform, due_date").eq("id", dealId).single();
  const { error } = await supabase.from("deliverables").insert(
    items.map((d) => ({ deal_id: dealId, type: d.type, quantity: d.quantity, notes: "note" in d ? d.note ?? null : null, platform: deal?.platform ?? null, due_date: deal?.due_date ?? null })),
  );
  if (error) return { error: error.message };
  refreshAll();
  return {};
}

/** Content went live. When everything on the deal is posted, the deal moves to "Posted". */
export async function markPosted(deliverableId: string, link: string) {
  const { supabase } = await requireUser();
  const { data: d, error } = await supabase
    .from("deliverables")
    .update({ status: "posted", posted_date: todayIST(), link: link.trim() || null })
    .eq("id", deliverableId)
    .select("deal_id, type")
    .single();
  if (error) throw new Error(error.message);
  const { data: rest } = await supabase.from("deliverables").select("status").eq("deal_id", d.deal_id);
  if (rest?.every((r) => r.status === "posted")) {
    await supabase.from("deals").update({ stage: "posted" }).eq("id", d.deal_id).in("stage", ["lead", "contacted", "negotiating", "confirmed", "in_progress"]);
  }
  refreshAll();
}

export async function unmarkPosted(deliverableId: string) {
  const { supabase } = await requireUser();
  await supabase.from("deliverables").update({ status: "todo", posted_date: null }).eq("id", deliverableId);
  refreshAll();
}

export async function removeContent(deliverableId: string) {
  const { supabase } = await requireUser();
  await supabase.from("deliverables").delete().eq("id", deliverableId);
  refreshAll();
}

/** "Got paid" — records the rest of the invoice as received (with the usual TDS) and closes the deal. */
export async function markInvoicePaid(invoiceId: string) {
  const { supabase } = await requireUser();
  const { data: inv } = await supabase.from("invoices").select("id, brand_id, deal_id, subtotal, tds_rate, tds_section, payments(gross_amount)").eq("id", invoiceId).single();
  if (!inv) throw new Error("Invoice not found.");
  const balance = round2(Number(inv.subtotal) - inv.payments.reduce((s, p) => s + Number(p.gross_amount), 0));
  if (balance <= 0) return;
  const tds = round2((balance * Number(inv.tds_rate ?? 0)) / 100);
  const { error } = await supabase.from("payments").insert({
    brand_id: inv.brand_id,
    invoice_id: inv.id,
    deal_id: inv.deal_id,
    received_date: todayIST(),
    gross_amount: balance,
    tds_amount: tds,
    tds_section: tds ? inv.tds_section : null,
    mode: "Bank transfer",
    notes: "Marked paid in one tap",
  });
  if (error) throw new Error(error.message);
  if (inv.deal_id) {
    await supabase.from("deals").update({ stage: "paid", next_follow_up: null }).eq("id", inv.deal_id);
    await supabase.from("activities").insert({ deal_id: inv.deal_id, brand_id: inv.brand_id, kind: "payment", body: `Paid: ${rupees(balance - tds)} in bank${tds ? ` + ${rupees(tds)} TDS` : ""}` });
  }
  refreshAll();
}

/** Paid without an invoice (e.g. barter or paid directly). */
export async function markDealPaid(dealId: string) {
  const { supabase } = await requireUser();
  await supabase.from("deals").update({ stage: "paid", next_follow_up: null }).eq("id", dealId);
  refreshAll();
}

export async function addNote(dealId: string, text: string): Promise<{ error?: string }> {
  const body = text.trim();
  if (!body) return { error: "Write something first." };
  const { supabase } = await requireUser();
  const { data: deal } = await supabase.from("deals").select("brand_id").eq("id", dealId).single();
  const { error } = await supabase.from("activities").insert({ deal_id: dealId, brand_id: deal?.brand_id ?? null, kind: "note", body });
  if (error) return { error: error.message };
  refreshAll();
  return {};
}

/** The short "fill it myself" form: brand, what, fee, where it stands. */
export async function quickCreateDeal(_prev: { error?: string } | undefined, fd: FormData): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  const brand = String(fd.get("brand") ?? "").trim();
  if (!brand) return { error: "Which brand?" };
  const what = String(fd.get("what") ?? "").trim();
  const feeRaw = String(fd.get("amount") ?? "").toLowerCase().replace(/[₹,\s]|rs\.?/g, "");
  const m = feeRaw.match(/^(\d+(?:\.\d+)?)(k|l)?$/);
  const amount = m ? Number(m[1]) * (m[2] === "k" ? 1000 : m[2] === "l" ? 100000 : 1) : null;
  if (feeRaw && !m) return { error: `"${fd.get("amount")}" isn't an amount — try 25000 or 25k.` };
  const stage = (STAGE_IDS as string[]).includes(String(fd.get("stage"))) ? (String(fd.get("stage")) as StageId) : "lead";
  const due = String(fd.get("due_date") ?? "") || null;
  const items = parseDeliverables(what);
  const title = String(fd.get("title") ?? "").trim() || (items.length ? items.map((d) => `${d.quantity > 1 ? `${d.quantity}× ` : ""}${d.type}`).join(" + ") : `${brand} collab`);

  let id: string;
  try {
    const brandId = await findOrCreateBrand(supabase, brand);
    const { data, error } = await supabase.from("deals").insert({ brand_id: brandId, title, amount, stage, due_date: due }).select("id").single();
    if (error) throw error;
    id = data.id;
    if (items.length) {
      const done = ["posted", "invoiced", "paid"].includes(stage);
      await supabase.from("deliverables").insert(items.map((d) => ({ deal_id: id, type: d.type, quantity: d.quantity, due_date: due, status: done ? ("posted" as const) : ("todo" as const), posted_date: done ? todayIST() : null })));
    }
    await supabase.from("activities").insert({ deal_id: id, brand_id: brandId, kind: "system", body: "Deal created" });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  refreshAll();
  redirect(`/deals?deal=${id}`);
}
