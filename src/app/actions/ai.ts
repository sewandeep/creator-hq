"use server";

import { requireUser } from "@/lib/auth";
import { RUNDOWN_PROMPT, runAssistant } from "@/lib/ai/assistant";
import { AiError } from "@/lib/finance/gemini";
import { refreshAll } from "./helpers";

export async function generateRundown(): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, userId } = await requireUser();
  try {
    await runAssistant(supabase, userId, { text: RUNDOWN_PROMPT, channel: "rundown" });
  } catch (e) {
    return { error: e instanceof AiError ? e.message : String(e) };
  }
  refreshAll();
  return { ok: true };
}

export async function clearChat() {
  const { supabase, userId } = await requireUser();
  await supabase.from("ai_messages").delete().eq("user_id", userId).eq("channel", "app");
  refreshAll();
}
