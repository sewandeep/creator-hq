"use server";

import { requireUser } from "@/lib/auth";
import { rupees, todayIST } from "@/lib/format";
import { FormError, date, money, requiredText, text, toActionError, type ActionState } from "@/lib/forms";
import { round2 } from "@/lib/money";
import { refreshAll } from "./helpers";

/**
 * Record money received. Give any two of: invoice amount (gross), TDS cut,
 * amount that reached the bank (net) — the third is worked out.
 */
export async function recordPayment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    let gross = money(fd, "gross_amount");
    let tds = money(fd, "tds_amount");
    const net = money(fd, "net_amount");
    if (gross === null && net !== null) gross = round2(net + (tds ?? 0));
    if (tds === null && gross !== null && net !== null) tds = round2(gross - net);
    tds = tds ?? 0;
    if (gross === null) throw new FormError("Enter the invoice amount covered, or the amount that reached your bank.");
    if (tds > gross) throw new FormError("TDS can't be more than the amount.");
    if (net !== null && Math.abs(gross - tds - net) > 0.5) {
      throw new FormError(`These don't add up: ${rupees(gross)} − ${rupees(tds)} TDS should equal ${rupees(gross - tds)}, not ${rupees(net)}.`);
    }

    const invoiceId = text(fd, "invoice_id");
    let brandId = text(fd, "brand_id");
    let dealId = text(fd, "deal_id");
    if (invoiceId) {
      const { data: inv, error } = await supabase.from("invoices").select("brand_id, deal_id").eq("id", invoiceId).single();
      if (error) throw error;
      brandId = inv.brand_id;
      dealId = dealId ?? inv.deal_id;
    }
    if (!brandId) brandId = requiredText(fd, "brand_id", "Brand");

    const { error } = await supabase.from("payments").insert({
      brand_id: brandId,
      invoice_id: invoiceId,
      deal_id: dealId,
      received_date: date(fd, "received_date") ?? todayIST(),
      gross_amount: gross,
      tds_amount: tds,
      tds_section: tds > 0 ? text(fd, "tds_section") : null,
      mode: text(fd, "mode"),
      reference: text(fd, "reference"),
      notes: text(fd, "notes"),
    });
    if (error) throw error;

    await supabase.from("activities").insert({
      deal_id: dealId,
      brand_id: brandId,
      kind: "payment",
      body: `Payment received: ${rupees(gross - tds)} in bank${tds ? ` (+ ${rupees(tds)} TDS)` : ""}`,
    });

    // Fully paid invoice → its deal becomes "Paid".
    if (invoiceId) {
      const { data: inv } = await supabase.from("invoices").select("status, deal_id").eq("id", invoiceId).single();
      if (inv?.status === "paid" && inv.deal_id) {
        await supabase.from("deals").update({ stage: "paid", next_follow_up: null }).eq("id", inv.deal_id).neq("stage", "paid");
      }
    } else if (dealId && fd.get("mark_deal_paid") === "on") {
      await supabase.from("deals").update({ stage: "paid", next_follow_up: null }).eq("id", dealId).neq("stage", "paid");
    }
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Payment recorded." };
}

export async function deletePayment(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshAll();
}
