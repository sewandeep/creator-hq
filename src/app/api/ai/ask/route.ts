import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAssistant } from "@/lib/ai/assistant";
import type { InFile } from "@/lib/ai/files";
import type { PageContext } from "@/lib/ai/context";
import { isQuickEntry } from "@/lib/ai/route-input";
import { quickAddCore } from "@/lib/finance/entries";
import { AiError } from "@/lib/finance/gemini";
import { todayIST } from "@/lib/format";
import { FormError } from "@/lib/forms";
import { createJob, runJob } from "@/lib/jobs";

// The AI may look things up several times before answering.
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    // Always answer with a readable message, never a bare error page.
    console.error("ask failed", e);
    return NextResponse.json({ error: `Something went wrong on the server: ${e instanceof Error ? e.message : String(e)}` });
  }
}

async function handle(req: Request) {
  const { supabase, userId } = await requireUser();
  const form = await req.formData();
  const text = String(form.get("text") ?? "").slice(0, 4000);
  let context: PageContext | null = null;
  try {
    context = form.get("context") ? (JSON.parse(String(form.get("context"))) as PageContext) : null;
  } catch {
    context = null;
  }
  const files: InFile[] = [];
  // Files the browser already put in storage (no size limit from the server).
  let uploaded: { path: string; name: string; mime: string }[] = [];
  try {
    uploaded = form.get("uploaded") ? (JSON.parse(String(form.get("uploaded"))) as typeof uploaded) : [];
  } catch {
    uploaded = [];
  }
  uploaded = uploaded.filter((u) => typeof u.path === "string" && u.path.startsWith(`${userId}/`)).slice(0, 10);
  for (const f of form.getAll("files")) {
    if (f instanceof File && f.size > 0) {
      if (f.size > 15 * 1024 * 1024) return NextResponse.json({ error: `${f.name} is over 15 MB.` }, { status: 400 });
      files.push({ name: f.name || "file", mime: f.type || "application/octet-stream", bytes: new Uint8Array(await f.arrayBuffer()) });
    }
  }
  if (!text.trim() && !files.length && !uploaded.length) return NextResponse.json({ error: "Type something or attach a file." }, { status: 400 });

  try {
    // "450 cab" style notes are saved straight away — no AI needed.
    if (!files.length && !uploaded.length && isQuickEntry(text, todayIST())) {
      const r = await quickAddCore(supabase, text, "manual");
      const now = Date.now();
      await supabase.from("ai_messages").insert([
        { channel: "app", role: "user", content: text, created_at: new Date(now).toISOString() },
        { channel: "app", role: "assistant", content: `✅ ${r.message}`, created_at: new Date(now + 1).toISOString() },
      ]);
      revalidatePath("/", "layout");
      return NextResponse.json({ reply: `✅ ${r.message}`, proposals: [], quick: true, transactionId: r.id });
    }
    // Save the message now, answer instantly, and let the AI work in the
    // background — so a slow answer can't drop the connection on a phone.
    const now = Date.now();
    const { data: rows, error } = await supabase
      .from("ai_messages")
      .insert([
        { channel: "app", role: "user", content: text.trim() || (uploaded.some((u) => u.mime.startsWith("audio/")) ? "🎤 Voice note" : "(sent a file)"), attachments: [...files, ...uploaded].map((f) => ({ name: f.name })), created_at: new Date(now).toISOString() },
        { channel: "app", role: "assistant", content: "", attachments: [{ pending: true }], created_at: new Date(now + 1).toISOString() },
      ])
      .select("id, role");
    if (error || !rows) throw new Error(error?.message ?? "Couldn't save your message.");
    const saved = { userMessageId: rows.find((r) => r.role === "user")!.id, replyMessageId: rows.find((r) => r.role === "assistant")!.id };
    const names = [...files, ...uploaded].map((f) => f.name);
    const title = text.trim() ? text.trim().slice(0, 80) : uploaded.some((u) => u.mime.startsWith("audio/")) ? "Voice note" : `File: ${names.join(", ")}`;
    const jobId = await createJob(supabase, { kind: "chat", title, refId: saved.replyMessageId });

    after(() =>
      runJob(
        supabase,
        userId,
        jobId,
        async (job) => {
          // Fetch anything the browser uploaded.
          for (const u of uploaded) {
            await job.step(`Opening ${u.name}`);
            const { data: blob, error: dlError } = await job.db.storage.from("inbox").download(u.path);
            if (dlError || !blob) throw new Error(`Couldn't open ${u.name}: ${dlError?.message ?? "missing"}`);
            files.push({ name: u.name, mime: u.mime, bytes: new Uint8Array(await blob.arrayBuffer()), path: u.path });
          }
          const r = await runAssistant(job.db, userId, { text, files, channel: "app", saved, context, job });
          return { summary: r.reply.slice(0, 300), result: { proposals: r.proposals.map((p) => p.id) } };
        },
        {
          onFail: async (message, cancelled, db) => {
            await db
              .from("ai_messages")
              .update({ content: cancelled ? "⏹ Stopped — nothing was saved." : `⚠️ ${message}`, attachments: [] })
              .eq("id", saved.replyMessageId);
          },
        },
      ),
    );
    return NextResponse.json({ pending: saved.replyMessageId, jobId });
  } catch (e) {
    const message = e instanceof AiError || e instanceof FormError ? e.message : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;
    return NextResponse.json({ error: message }, { status: 200 });
  }
}
