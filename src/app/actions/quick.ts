"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addDays, fmtDate, todayIST } from "@/lib/format";
import { createDraftInvoiceFromDeal } from "@/lib/invoice-draft";
import { refreshAll } from "./helpers";

// One-tap actions used on Today and on deal cards.

/** "Followed up" — log it and set the next reminder (0 = no more reminders). */
export async function followedUp(dealId: string, inDays: number) {
  const { supabase } = await requireUser();
  const next = inDays > 0 ? addDays(todayIST(), inDays) : null;
  const { data: deal } = await supabase.from("deals").update({ next_follow_up: next }).eq("id", dealId).select("brand_id").single();
  await supabase.from("activities").insert({ deal_id: dealId, brand_id: deal?.brand_id ?? null, kind: "follow_up", body: `Followed up${next ? ` · next follow-up ${fmtDate(next)}` : " · no further follow-up"}` });
  refreshAll();
}

/** Push a follow-up reminder to later without logging a follow-up. */
export async function snoozeFollowUp(dealId: string, inDays: number) {
  const { supabase } = await requireUser();
  await supabase.from("deals").update({ next_follow_up: addDays(todayIST(), inDays) }).eq("id", dealId);
  refreshAll();
}

/** Creates the invoice from the deal and opens the email with it attached — check and send. */
export async function invoiceAndSend(dealId: string) {
  const { supabase } = await requireUser();
  const { data: existing } = await supabase.from("invoices").select("id, status").eq("deal_id", dealId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const inv = existing ?? (await createDraftInvoiceFromDeal(supabase, dealId, ""));
  refreshAll();
  redirect(`/email/compose?invoice=${inv.id}&template=${encodeURIComponent("Send invoice")}`);
}
