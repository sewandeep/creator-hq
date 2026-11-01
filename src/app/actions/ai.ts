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

/** Setup check: one tiny request with the assistant's tools, reporting the exact error if any. */
export async function testAssistant(): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  const started = Date.now();
  try {
    const { callGemini } = await import("@/lib/finance/gemini");
    const { TOOL_DECLARATIONS } = await import("@/lib/ai/tools");
    const { json, model } = await callGemini({
      systemInstruction: { parts: [{ text: "You are a test. Reply with the single word OK." }] },
      contents: [{ role: "user", parts: [{ text: "Say OK." }] }],
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      generationConfig: { temperature: 0 },
    });
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
    return { ok: true, message: `Working ✓ — ${model} answered in ${((Date.now() - started) / 1000).toFixed(1)}s${text ? ` ("${text.slice(0, 40)}")` : parts.some((p) => p.functionCall) ? " (it tried to use a tool, which is fine)" : ""}.` };
  } catch (e) {
    return { ok: false, message: e instanceof AiError ? e.message : `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
