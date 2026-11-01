"use server";

import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { RUNDOWN_PROMPT, runAssistant } from "@/lib/ai/assistant";
import { AiError } from "@/lib/finance/gemini";
import { refreshAll } from "./helpers";

/** Starts writing a rundown in the background (the Home card refreshes until it appears). */
export async function generateRundown(): Promise<{ ok?: boolean; error?: string; since?: string }> {
  const { supabase, userId } = await requireUser();
  const since = new Date().toISOString();
  const db = isAdminConfigured() ? createAdminClient(userId) : supabase;
  after(async () => {
    try {
      await runAssistant(db, userId, { text: RUNDOWN_PROMPT, channel: "rundown" });
    } catch (e) {
      await db.from("ai_messages").insert({ channel: "rundown", role: "assistant", content: `⚠️ Couldn't write the rundown: ${e instanceof AiError ? e.message : String(e)}` });
    }
  });
  return { ok: true, since };
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
