"use server";

import { requireUser } from "@/lib/auth";
import { addDays, rupees, todayIST } from "@/lib/format";
import { grossFromNet, linkTxnToInvoice } from "@/lib/income-link";
import { createDraftInvoiceFromDeal } from "@/lib/invoice-draft";
import { round2 } from "@/lib/money";
import { findOrCreateBrand, refreshAll } from "./helpers";

// A deal's money, kept simple: who it came through (agency or direct), whether
// TDS is cut (then everything that arrives is "after TDS"), the invoice, and
// any number of payments (advance, second part, final…).

type Result = { error?: string; groupId?: string; message?: string };
const section = (rate: number) => (rate === 2 ? "194C" : rate ? "194J" : null);

/** Which agency a deal came through (empty = direct with the brand). */
export async function setDealAgency(dealId: string, agencyName: string): Promise<Result> {
  const { supabase } = await requireUser();
  const name = agencyName.trim();
  let agencyId: string | null = null;
  let rule: number | null = null;
  if (name) {
    agencyId = await findOrCreateBrand(supabase, name);
    const { data: a } = await supabase.from("brands").update({ is_agency: true }).eq("id", agencyId).select("tds_rate").single();
    rule = a?.tds_rate === null || a?.tds_rate === undefined ? null : Number(a.tds_rate);
  }
  const { data: deal } = await supabase.from("deals").select("tds_rate").eq("id", dealId).single();
  const { error } = await supabase
    .from("deals")
    .update({ agency_id: agencyId, ...(rule !== null && deal?.tds_rate === null ? { tds_rate: rule } : {}) })
    .eq("id", dealId);
  if (error) return { error: error.message };
  return { ...(await refreshAll()), message: name ? `Through ${name}` : "Direct with the brand" };
}

/** TDS on or off for a deal (0 = no TDS). Recalculates payments already recorded. */
export async function setDealTds(dealId: string, rate: number): Promise<Result> {
  const { supabase } = await requireUser();
  const r = [0, 1, 2, 5, 10].includes(rate) ? rate : 10;
  await supabase.from("deals").update({ tds_rate: r }).eq("id", dealId);
  const { data: invs } = await supabase.from("invoices").select("id, payments(id, gross_amount, tds_amount)").eq("deal_id", dealId).neq("status", "cancelled");
  for (const inv of invs ?? []) {
    await supabase.from("invoices").update({ tds_rate: r, tds_section: section(r) }).eq("id", inv.id);
    for (const p of inv.payments) {
      const net = round2(Number(p.gross_amount) - Number(p.tds_amount));
      const gross = grossFromNet(net, r);
      await supabase.from("payments").update({ gross_amount: gross, tds_amount: round2(gross - net), tds_section: section(r) }).eq("id", p.id);
    }
  }
  await syncDealStage(supabase, dealId);
  return { ...(await refreshAll()), message: r ? `TDS ${r}% — payments count as after TDS` : "No TDS on this deal" };
}

/** An agency's or brand's standing rule: is it an agency, does it cut TDS (and how much). */
export async function setPartyRule(brandId: string, rule: { isAgency?: boolean; tdsRate?: number | null }): Promise<Result> {
  const { supabase } = await requireUser();
  const update: { is_agency?: boolean; tds_rate?: number | null } = {};
  if (rule.isAgency !== undefined) update.is_agency = rule.isAgency;
  if (rule.tdsRate !== undefined) update.tds_rate = rule.tdsRate;
  const { error } = await supabase.from("brands").update(update).eq("id", brandId);
  if (error) return { error: error.message };
  // Ongoing deals without their own setting follow the new rule.
  if (rule.tdsRate !== undefined && rule.tdsRate !== null) {
    await supabase.from("deals").update({ tds_rate: rule.tdsRate }).is("tds_rate", null).or(`agency_id.eq.${brandId},and(brand_id.eq.${brandId},agency_id.is.null)`).not("stage", "in", "(paid,lost)");
  }
  return { ...(await refreshAll()), message: "Saved" };
}

/** The deal's open invoice, created (as a draft) if there isn't one yet. */
async function ensureInvoice(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], dealId: string, netHint?: number) {
  const { data: deal } = await supabase.from("deals").select("id, amount, tds_rate, invoices(id, status)").eq("id", dealId).single();
  if (!deal) throw new Error("Deal not found.");
  const open = deal.invoices.find((i) => i.status !== "cancelled");
  if (open) return open.id;
  if (!deal.amount) {
    if (!netHint) throw new Error("Add the deal's fee first.");
    await supabase.from("deals").update({ amount: grossFromNet(netHint, Number(deal.tds_rate ?? 0)) }).eq("id", dealId);
  }
  const inv = await createDraftInvoiceFromDeal(supabase, dealId, "");
  return inv.id;
}

/** Paid in full → stage "paid"; otherwise invoiced stays invoiced. */
async function syncDealStage(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], dealId: string) {
  const { data: invs } = await supabase.from("invoices").select("status").eq("deal_id", dealId).neq("status", "cancelled");
  const { data: deal } = await supabase.from("deals").select("stage").eq("id", dealId).single();
  if (!deal || !invs?.length) return;
  const paid = invs.every((i) => i.status === "paid");
  if (paid && deal.stage !== "paid") await supabase.from("deals").update({ stage: "paid", next_follow_up: null }).eq("id", dealId);
  if (!paid && deal.stage === "paid") await supabase.from("deals").update({ stage: "invoiced" }).eq("id", dealId);
}

/** Bank money that could be a payment for this deal: unlinked money in, closest amounts first. */
export async function paymentCandidates(dealId: string) {
  const { supabase } = await requireUser();
  const { data: deal } = await supabase.from("deals").select("amount, tds_rate, deal_date, invoices(subtotal, status, payments(gross_amount, tds_amount))").eq("id", dealId).single();
  const gross = Number(deal?.invoices.find((i) => i.status !== "cancelled")?.subtotal ?? deal?.amount ?? 0);
  const got = (deal?.invoices ?? []).flatMap((i) => i.payments).reduce((s, p) => s + Number(p.gross_amount), 0);
  const rate = Number(deal?.tds_rate ?? 0);
  const remainingNet = Math.max(0, (gross - got) * (1 - rate / 100));
  const since = addDays(deal?.deal_date ?? todayIST(), -60);
  const { data } = await supabase
    .from("transactions")
    .select("id, txn_date, amount, counterparty, description, note, category:categories(name, kind)")
    .eq("direction", "credit")
    .is("payment_id", null)
    .is("pair_id", null)
    .gte("txn_date", since)
    .gte("amount", 100)
    .order("txn_date", { ascending: false })
    .limit(300);
  const ok = (data ?? []).filter((t) => !t.category || ["income"].includes(t.category.kind) && !/sajilo/i.test(t.category.name));
  return {
    remainingNet: round2(remainingNet),
    rate,
    items: ok
      .map((t) => ({ id: t.id, date: t.txn_date, amount: Number(t.amount), who: t.counterparty || t.description.slice(0, 40), note: t.note, category: t.category?.name ?? null }))
      .sort((a, b) => Math.abs(a.amount - remainingNet) - Math.abs(b.amount - remainingNet) || (a.date < b.date ? 1 : -1))
      .slice(0, 12),
  };
}

/** Adds a payment to the deal: a bank line you picked, or an amount you type (cash, other account). */
export async function addDealPayment(dealId: string, input: { txnId?: string; amount?: number; date?: string; note?: string }): Promise<Result> {
  const { supabase } = await requireUser();
  try {
    if (input.txnId) {
      const { data: t } = await supabase.from("transactions").select("amount").eq("id", input.txnId).single();
      const invoiceId = await ensureInvoice(supabase, dealId, Number(t?.amount ?? 0));
      const r = await linkTxnToInvoice(supabase, input.txnId, invoiceId);
      await syncDealStage(supabase, dealId);
      return { ...(await refreshAll()), message: `Payment added${r.tds ? ` (+ ${rupees(r.tds)} TDS)` : ""}` };
    }
    const net = round2(Number(input.amount));
    if (!(net > 0)) return { error: "Enter the amount that reached you." };
    const invoiceId = await ensureInvoice(supabase, dealId, net);
    const { data: inv } = await supabase.from("invoices").select("brand_id, tds_rate, tds_section").eq("id", invoiceId).single();
    const rate = Number(inv?.tds_rate ?? 0);
    const gross = grossFromNet(net, rate);
    const { error } = await supabase.from("payments").insert({
      brand_id: inv!.brand_id,
      invoice_id: invoiceId,
      deal_id: dealId,
      received_date: input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : todayIST(),
      gross_amount: gross,
      tds_amount: round2(gross - net),
      tds_section: rate ? inv!.tds_section : null,
      mode: "Other",
      notes: input.note?.trim() || "Added by hand",
    });
    if (error) return { error: error.message };
    await syncDealStage(supabase, dealId);
    return { ...(await refreshAll()), message: `Payment of ${rupees(net)} added` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add the payment." };
  }
}

/** Removes a payment (its bank line goes back to unlinked). */
export async function removePayment(paymentId: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { data: p } = await supabase.from("payments").select("deal_id").eq("id", paymentId).single();
  await supabase.from("transactions").update({ payment_id: null }).eq("payment_id", paymentId);
  const { error } = await supabase.from("payments").delete().eq("id", paymentId);
  if (error) return { error: error.message };
  if (p?.deal_id) await syncDealStage(supabase, p.deal_id);
  return { ...(await refreshAll()), message: "Payment removed" };
}

/** Creates the deal's invoice (draft) without sending it. */
export async function createDealInvoice(dealId: string): Promise<Result> {
  const { supabase } = await requireUser();
  try {
    await ensureInvoice(supabase, dealId);
    return { ...(await refreshAll()), message: "Invoice created (draft)" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create it." };
  }
}

/** The simple invoice editor: who it's to, dates, and the lines. */
export async function saveInvoiceSimple(
  invoiceId: string,
  input: { billToId: string; issueDate: string; dueDate: string; items: { description: string; quantity: number; rate: number }[] },
): Promise<Result> {
  const { supabase } = await requireUser();
  const items = input.items.filter((i) => i.description.trim() && Number(i.rate) > 0);
  if (!items.length) return { error: "Add at least one line with an amount." };
  const { data: party } = await supabase.from("brands").select("id, name, legal_name, billing_address, gstin, pan").eq("id", input.billToId).single();
  if (!party) return { error: "Pick who the invoice is for." };
  const { error } = await supabase
    .from("invoices")
    .update({
      brand_id: party.id,
      bill_to_name: party.legal_name || party.name,
      bill_to_address: party.billing_address,
      bill_to_gstin: party.gstin,
      bill_to_pan: party.pan,
      issue_date: /^\d{4}-\d{2}-\d{2}$/.test(input.issueDate) ? input.issueDate : undefined,
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null,
    })
    .eq("id", invoiceId);
  if (error) return { error: error.message };
  await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(items.map((it, position) => ({ invoice_id: invoiceId, position, description: it.description.trim().slice(0, 300), quantity: Number(it.quantity) || 1, rate: round2(Number(it.rate)) })));
  if (itemsError) return { error: itemsError.message };
  // Payments already recorded move to the new "billed to" party too.
  await supabase.from("payments").update({ brand_id: party.id }).eq("invoice_id", invoiceId);
  const { data: inv } = await supabase.from("invoices").select("deal_id").eq("id", invoiceId).single();
  if (inv?.deal_id) await syncDealStage(supabase, inv.deal_id);
  return { ...(await refreshAll()), message: "Invoice saved" };
}

/**
 * Which brand a deal is for. If the deal's current "brand" is really an agency
 * (marked as one), it becomes the deal's agency automatically.
 */
export async function setDealBrand(dealId: string, brandName: string): Promise<Result> {
  const { supabase } = await requireUser();
  const name = brandName.trim();
  if (!name) return { error: "Type the brand's name." };
  const { data: deal } = await supabase.from("deals").select("brand_id, agency_id, brand:brands(is_agency)").eq("id", dealId).single();
  if (!deal) return { error: "Deal not found." };
  const brandId = await findOrCreateBrand(supabase, name);
  const moveAgency = !deal.agency_id && deal.brand?.is_agency && deal.brand_id !== brandId;
  const { error } = await supabase
    .from("deals")
    .update({ brand_id: brandId, ...(moveAgency ? { agency_id: deal.brand_id } : {}) })
    .eq("id", dealId);
  if (error) return { error: error.message };
  return { ...(await refreshAll()), message: moveAgency ? `For ${name} (through the agency)` : `Brand: ${name}` };
}
