"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { bool, type ActionState } from "@/lib/forms";
import { getMe, setCommands, setWebhook } from "@/lib/telegram/api";
import { runDailyDigest } from "@/lib/telegram/run-digest";
import { refreshAll } from "./helpers";

export type TgResult = { ok?: boolean; error?: string; message?: string; link?: string };

/** Points Telegram at this app (uses the address you're on right now). */
export async function registerWebhook(): Promise<TgResult> {
  await requireUser();
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (!host || /localhost|127\.0\.0\.1/.test(host) && !process.env.TELEGRAM_API_BASE) return { error: "Open the app on its real web address (not localhost) and try again." };
    await setWebhook(`${proto}://${host}/api/telegram/webhook`);
    await setCommands();
    refreshAll();
    return { ok: true, message: `Telegram now sends messages to ${host}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Creates a one-time link that connects your Telegram chat (valid 15 minutes). */
export async function startTelegramLink(): Promise<TgResult> {
  const { supabase, userId } = await requireUser();
  try {
    const me = await getMe();
    const code = randomBytes(12).toString("base64url");
    const { error } = await supabase
      .from("profile")
      .upsert({ user_id: userId, telegram_link_code: code, telegram_link_expires: new Date(Date.now() + 15 * 60_000).toISOString() });
    if (error) throw error;
    return { ok: true, link: `https://t.me/${me.username}?start=${code}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function disconnectTelegram() {
  const { supabase, userId } = await requireUser();
  await supabase.from("profile").update({ telegram_chat_id: null, telegram_state: {} }).eq("user_id", userId);
  refreshAll();
}

export async function sendDigestNow(): Promise<TgResult> {
  const { userId } = await requireUser();
  try {
    const r = await runDailyDigest({ force: true, userId });
    if (!r.length) return { error: "Connect your Telegram first." };
    return { ok: true, message: r[0].items ? `Sent — ${r[0].items} item${r[0].items === 1 ? "" : "s"}.` : "Sent — nothing needs you today." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveReminders(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("profile")
    .upsert({ user_id: userId, reminders: { digest: bool(fd, "digest"), statements: bool(fd, "statements") } });
  if (error) return { error: error.message };
  refreshAll();
  return { ok: true, message: "Saved." };
}
