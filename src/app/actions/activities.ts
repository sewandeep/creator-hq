"use server";

import { requireUser } from "@/lib/auth";
import { ACTIVITY_KINDS } from "@/lib/constants";
import { oneOf, requiredText, toActionError, type ActionState } from "@/lib/forms";
import { refreshAll } from "./helpers";

const KINDS = ACTIVITY_KINDS.map((k) => k.id);

export async function addActivity(dealId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const { data: deal, error: dealError } = await supabase.from("deals").select("brand_id").eq("id", dealId).single();
    if (dealError) throw dealError;
    const { error } = await supabase.from("activities").insert({
      deal_id: dealId,
      brand_id: deal.brand_id,
      kind: oneOf(fd, "kind", KINDS) ?? "note",
      body: requiredText(fd, "body", "Note"),
    });
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true };
}

export async function deleteActivity(activityId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("activities").delete().eq("id", activityId);
  if (error) throw new Error(error.message);
  refreshAll();
}
