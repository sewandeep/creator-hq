import "server-only";
import { todayIST } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
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
    const db = createAdminClient(p.user_id);
    const d = await buildDigest(db, p.user_id, state, prefs);
    if (d.lines.length) await send(Number(p.telegram_chat_id), digestText(d.lines), d.keyboard);
    else if (opts.force) await send(Number(p.telegram_chat_id), "✨ Nothing needs you today.");
    await admin
      .from("profile")
      .update({ last_digest_on: today, ...(d.recapFor ? { telegram_state: { ...state, lastRecap: d.recapFor } } : {}) })
      .eq("user_id", p.user_id);
    results.push({ userId: p.user_id, sent: d.lines.length > 0, items: d.lines.length });
  }
  return results;
}
