"use server";

import { requireUser } from "@/lib/auth";
import { FormError, money, requiredText, text, toActionError, type ActionState } from "@/lib/forms";
import { refreshAll } from "./helpers";

export async function saveRate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const price = money(fd, "price");
    if (price === null) throw new FormError("Enter your price.");
    const { error } = await supabase.from("rate_card").upsert(
      { type: requiredText(fd, "type", "Type"), platform: text(fd, "platform") ?? "", price, notes: text(fd, "notes") },
      { onConflict: "user_id,type,platform" },
    );
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true };
}

export async function deleteRate(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("rate_card").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshAll();
}
