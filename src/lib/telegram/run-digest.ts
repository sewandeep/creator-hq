import "server-only";
import { todayIST } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { RUNDOWN_PROMPT, runAssistant } from "@/lib/ai/assistant";
import { mdToTelegram } from "@/lib/ai/format";
import { isAiConfigured } from "@/lib/finance/gemini";
import { createJob, runJob, sweepStaleJobs } from "@/lib/jobs";
import { send } from "./api";
import { buildDigest, digestText, type BotState } from "./digest";

/** Sends the morning message to everyone with Telegram connected (just you). */
export async function runDailyDigest(opts: { force?: boolean; userId?: string } = {}) {
  const admin = createAdminClient();
  let q = admin.from("profile").select("user_id, telegram_chat_id, telegram_state, reminders, last_digest_on").not("telegram_chat_id", "is", null);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data: profiles } = await q;
  const today = todayIST();
  const results: { userId: string; sent: boolean; items: number; reason?: string }[] = [];

  for (const p of profiles ?? []) {
    const prefs = (p.reminders ?? {}) as { digest?: boolean; statements?: boolean };
    if (!opts.force && prefs.digest === false) {
      results.push({ userId: p.user_id, sent: false, items: 0, reason: "turned off" });
      continue;
    }
    if (!opts.force && p.last_digest_on === today) {
      results.push({ userId: p.user_id, sent: false, items: 0, reason: "already sent today" });
      continue;
    }
    const state = (p.telegram_state ?? {}) as BotState;
    const base = createAdminClient(p.user_id);
    await sweepStaleJobs(base);
    let items = 0;
    const jobId = await createJob(base, { kind: "daily", source: "auto", title: "Morning check (9 AM)", userId: p.user_id });
    await runJob(base, p.user_id, jobId, async (job) => {
      const db = job.db;
      await job.step("Looking for anything that needs you");
      const d = await buildDigest(db, p.user_id, state, prefs);
      items = d.lines.length;
      if (d.lines.length) await send(Number(p.telegram_chat_id), digestText(d.lines), d.keyboard);
      else if (opts.force) await send(Number(p.telegram_chat_id), "✨ Nothing needs you today.");
      await admin
        .from("profile")
        .update({ last_digest_on: today, ...(d.recapFor ? { telegram_state: { ...state, lastRecap: d.recapFor } } : {}) })
        .eq("user_id", p.user_id);
      await job.step(d.lines.length ? `Sent ${d.lines.length} reminder${d.lines.length === 1 ? "" : "s"} to Telegram` : "Nothing needed you today");
      // Sundays: an AI-written rundown of the week.
      const isSunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
      if (isSunday && isAiConfigured() && !opts.force) {
        await job.step("Writing the weekly rundown");
        const r = await runAssistant(db, p.user_id, { text: RUNDOWN_PROMPT, channel: "rundown", job });
        await send(Number(p.telegram_chat_id), `🗓️ <b>Your weekly rundown</b>\n\n${mdToTelegram(r.reply)}`);
      }
      return { summary: d.lines.length ? `${d.lines.length} reminder${d.lines.length === 1 ? "" : "s"} sent` : "Nothing needed you" };
    });
    results.push({ userId: p.user_id, sent: items > 0, items });
  }
  return results;
}
