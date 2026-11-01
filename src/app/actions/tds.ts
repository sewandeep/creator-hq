"use server";

import { requireUser } from "@/lib/auth";
import { money, text, toActionError, type ActionState } from "@/lib/forms";
import { refreshAll } from "./helpers";

/** Save what Form 26AS / AIS shows for one brand in one financial year. */
export async function saveTdsCheck(fy: number, brandId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const tds = money(fd, "tds_in_26as");
    const amount = money(fd, "amount_in_26as");
    const tan = text(fd, "tan")?.toUpperCase() ?? null;
    if (tds === null && amount === null) {
      await supabase.from("tds_checks").delete().eq("fy", fy).eq("brand_id", brandId);
    } else {
      const { error } = await supabase.from("tds_checks").upsert(
        { fy, brand_id: brandId, tds_in_26as: tds, amount_in_26as: amount, checked_on: new Date().toISOString().slice(0, 10), notes: text(fd, "notes") },
        { onConflict: "user_id,fy,brand_id" },
      );
      if (error) throw error;
    }
    if (tan) await supabase.from("brands").update({ tan }).eq("id", brandId);
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Saved." };
}
