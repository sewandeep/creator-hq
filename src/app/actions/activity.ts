"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

export type UndoResult = { ok: boolean; message: string };

/** Puts back everything one tap or one job changed. */
export async function undoChanges(groupId: string): Promise<UndoResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("undo_group", { p_group: groupId });
  if (error) return { ok: false, message: `Couldn't undo: ${error.message}` };
  const r = (data ?? {}) as { undone?: number; skipped?: number; already?: boolean; missing?: boolean };
  if (r.already) return { ok: true, message: "Already undone." };
  if (r.missing) return { ok: false, message: "Nothing to undo." };

  // Keep related records honest.
  const { data: job } = await supabase.from("jobs").select("id, kind, ref_id").eq("id", groupId).maybeSingle();
  if (job?.kind === "apply" && job.ref_id) {
    await supabase.from("ai_proposals").update({ status: "cancelled", result: { ok: false, message: "Undone." } }).eq("id", job.ref_id);
  }
  if (job?.kind === "statement" && job.ref_id) {
    await supabase.from("statements").update({ status: "failed", error: "Undone — its transactions were removed. Tap Try again to read it again." }).eq("id", job.ref_id);
  }

  revalidatePath("/", "layout");
  const undone = r.undone ?? 0;
  const skipped = r.skipped ?? 0;
  return {
    ok: true,
    message: `Undone${undone ? ` (${undone} change${undone === 1 ? "" : "s"})` : ""}.${skipped ? ` ${skipped} item${skipped === 1 ? " was" : "s were"} changed again since, so ${skipped === 1 ? "it was" : "they were"} left as is.` : ""}`,
  };
}
