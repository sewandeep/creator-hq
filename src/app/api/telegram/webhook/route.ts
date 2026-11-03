import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { createJob, runJob } from "@/lib/jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { esc, send, webhookSecret } from "@/lib/telegram/api";
import { handleUpdate, type TgUpdate } from "@/lib/telegram/bot";

// Reading a forwarded statement can take a minute or two (runs after we reply to Telegram).
export const maxDuration = 300;

/** What this message looks like in Activity. */
function titleOf(u: TgUpdate) {
  const m = u.message;
  if (u.callback_query) return `Telegram: tapped “${(u.callback_query.data ?? "").split(":")[0]}”`;
  if (!m) return "Telegram";
  if (m.voice) return "Telegram: voice note";
  if (m.photo?.length) return `Telegram: photo${m.caption ? ` — ${m.caption}` : ""}`;
  if (m.document) return `Telegram: ${m.document.file_name ?? "file"}`;
  return `Telegram: ${(m.text ?? "").slice(0, 80)}`;
}

export async function POST(req: Request) {
  // Only Telegram knows this secret (we gave it when registering the webhook).
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(webhookSecret());
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new NextResponse("Forbidden", { status: 403 });

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update) return NextResponse.json({ ok: true });

  // Messages from your linked chat are tracked as jobs (status, steps, Undo in Activity).
  const chatId = (update.message ?? update.callback_query?.message)?.chat.id;
  const admin = createAdminClient();
  const { data: owner } = chatId ? await admin.from("profile").select("user_id").eq("telegram_chat_id", chatId).maybeSingle() : { data: null };

  try {
    if (!owner) {
      const later = await handleUpdate(update);
      if (later) after(() => later().catch((e) => console.error("telegram background task failed", e)));
      return NextResponse.json({ ok: true });
    }
    const base = createAdminClient(owner.user_id);
    const jobId = await createJob(base, { kind: "telegram", source: "telegram", title: titleOf(update), userId: owner.user_id });
    // The quick part runs now (Telegram wants a fast reply); anything slow continues after.
    let later: (() => Promise<void>) | void = undefined;
    let quickError: unknown = null;
    const { jobClient } = await import("@/lib/jobs");
    const db = jobClient(owner.user_id, jobId, base);
    try {
      later = await handleUpdate(update, {
        id: jobId,
        db,
        step: async (text) => {
          await db.rpc("job_step", { p_job: jobId, p_text: text });
        },
        checkpoint: async () => {},
      });
    } catch (e) {
      quickError = e;
    }
    after(() =>
      runJob(base, owner.user_id, jobId, async (job) => {
        if (quickError) throw quickError;
        if (later) await later();
        void job;
      }, {
        onFail: async (message, cancelled) => {
          if (!cancelled && chatId) await send(chatId, `⚠️ ${esc(message)}\n\n<i>It's also in Activity in the app.</i>`).catch(() => {});
        },
      }),
    );
  } catch (e) {
    // Always answer 200, otherwise Telegram keeps re-sending the same message.
    console.error("telegram update failed", e);
  }
  return NextResponse.json({ ok: true });
}
