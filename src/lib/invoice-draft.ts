import "server-only";
import type { DB } from "@/app/actions/helpers";
import { addDays, rupees, todayIST } from "./format";
import { nextInvoiceNumber } from "./invoice-number";

export type DraftItem = { description: string; quantity: string; rate: string };

/** Line items for an invoice, worked out from a deal's fee and deliverables. */
export async function itemsFromDeal(supabase: DB, dealId: string) {
  const { data: deal } = await supabase
    .from("deals")
    .select("id, title, brand_id, amount, platform, deliverables(type, quantity, platform)")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return null;
  const amount = Number(deal.amount ?? 0);
  const dels = deal.deliverables;
  const platform = (d: { platform: string | null }) => d.platform || deal.platform;
  let items: DraftItem[];
  if (dels.length === 1) {
    const d = dels[0];
    items = [{
      description: `${platform(d) ? `${platform(d)} ` : ""}${d.type} — ${deal.title}`,
      quantity: String(d.quantity),
      rate: amount ? String(Math.round((amount / d.quantity) * 100) / 100) : "",
    }];
  } else {
    const what = dels.map((d) => `${d.quantity > 1 ? `${d.quantity}× ` : ""}${d.type}`).join(", ");
    items = [{ description: `${deal.title}${what ? ` (${what})` : ""}`, quantity: "1", rate: amount ? String(amount) : "" }];
  }
  return { deal, items };
}

/** Creates a draft invoice for a deal with your usual defaults. Returns its id and number. */
export async function createDraftInvoiceFromDeal(supabase: DB, dealId: string) {
  const prepared = await itemsFromDeal(supabase, dealId);
  if (!prepared) throw new Error("Deal not found.");
  const { deal, items } = prepared;
  if (!items.length || !items.some((i) => Number(i.rate) > 0)) throw new Error("This deal has no fee yet — add the amount first.");
  const [{ data: profile }, { data: brand }] = await Promise.all([
    supabase.from("profile").select("invoice_prefix, payment_terms_days, default_tds_rate, default_tds_section").maybeSingle(),
    supabase.from("brands").select("name, legal_name, billing_address, gstin, pan").eq("id", deal.brand_id).single(),
  ]);
  const today = todayIST();
  const num = await nextInvoiceNumber(supabase, profile?.invoice_prefix ?? "INV", today);
  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({
      brand_id: deal.brand_id,
      deal_id: deal.id,
      fy: num.fy,
      seq: num.seq,
      invoice_number: num.number,
      issue_date: today,
      due_date: addDays(today, profile?.payment_terms_days ?? 15),
      bill_to_name: brand?.legal_name || brand?.name || "",
      bill_to_address: brand?.billing_address ?? null,
      bill_to_gstin: brand?.gstin ?? null,
      bill_to_pan: brand?.pan ?? null,
      tds_rate: profile?.default_tds_rate ?? 10,
      tds_section: profile?.default_tds_section ?? "194J",
    })
    .select("id, invoice_number")
    .single();
  if (error) throw new Error(error.message);
  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(items.map((it, position) => ({ invoice_id: inv.id, position, description: it.description, quantity: Number(it.quantity) || 1, rate: Number(it.rate) || 0 })));
  if (itemsError) throw new Error(itemsError.message);
  const total = items.reduce((t, i) => t + (Number(i.quantity) || 1) * (Number(i.rate) || 0), 0);
  await supabase.from("activities").insert({ deal_id: deal.id, brand_id: deal.brand_id, kind: "invoice", body: `Invoice ${inv.invoice_number} drafted for ${rupees(total)} (by AI assistant)` });
  return inv;
}
