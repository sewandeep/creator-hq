import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAssistant } from "@/lib/ai/assistant";
import type { InFile } from "@/lib/ai/files";
import { isQuickEntry } from "@/lib/ai/route-input";
import { quickAddCore } from "@/lib/finance/entries";
import { AiError } from "@/lib/finance/gemini";
import { todayIST } from "@/lib/format";
import { FormError } from "@/lib/forms";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { supabase, userId } = await requireUser();
  const form = await req.formData();
  const text = String(form.get("text") ?? "").slice(0, 4000);
  const files: InFile[] = [];
  for (const f of form.getAll("files")) {
    if (f instanceof File && f.size > 0) {
      if (f.size > 15 * 1024 * 1024) return NextResponse.json({ error: `${f.name} is over 15 MB.` }, { status: 400 });
      files.push({ name: f.name || "file", mime: f.type || "application/octet-stream", bytes: new Uint8Array(await f.arrayBuffer()) });
    }
  }
  if (!text.trim() && !files.length) return NextResponse.json({ error: "Type something or attach a file." }, { status: 400 });

  try {
    // "450 cab" style notes are saved straight away — no AI needed.
    if (!files.length && isQuickEntry(text, todayIST())) {
      const r = await quickAddCore(supabase, text, "manual");
      const now = Date.now();
      await supabase.from("ai_messages").insert([
        { channel: "app", role: "user", content: text, created_at: new Date(now).toISOString() },
        { channel: "app", role: "assistant", content: `✅ ${r.message}`, created_at: new Date(now + 1).toISOString() },
      ]);
      revalidatePath("/", "layout");
      return NextResponse.json({ reply: `✅ ${r.message}`, proposals: [], quick: true, transactionId: r.id });
    }
    const r = await runAssistant(supabase, userId, { text, files, channel: "app" });
    const { data: proposals } = r.proposals.length
      ? await supabase.from("ai_proposals").select("id, kind, summary, payload, status, result").in("id", r.proposals.map((p) => p.id))
      : { data: [] };
    return NextResponse.json({ reply: r.reply, proposals: proposals ?? [] });
  } catch (e) {
    const message = e instanceof AiError || e instanceof FormError ? e.message : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;
    return NextResponse.json({ error: message }, { status: 200 });
  }
}
