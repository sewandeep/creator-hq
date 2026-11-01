import "server-only";
import { createHash } from "node:crypto";

// Thin wrapper around the Telegram Bot API (https://core.telegram.org/bots/api).
// TELEGRAM_BOT_TOKEN comes from @BotFather.

const BASE = process.env.TELEGRAM_API_BASE?.replace(/\/+$/, "") || "https://api.telegram.org";

export function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

export function isTelegramConfigured() {
  return Boolean(botToken());
}

/** Secret Telegram must send with every webhook call, derived from the token (no extra setting needed). */
export function webhookSecret() {
  return createHash("sha256").update(`creator-hq-webhook:${botToken()}`).digest("hex").slice(0, 48);
}

export type Button = { text: string; callback_data?: string; url?: string };
export type Keyboard = Button[][];

async function call<T = unknown>(method: string, body: object): Promise<T> {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN isn't set.");
  const res = await fetch(`${BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
  return json.result as T;
}

export function send(chatId: number, text: string, keyboard?: Keyboard) {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function edit(chatId: number, messageId: number, text: string, keyboard?: Keyboard) {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard ?? [] },
  }).catch(() => null); // "message is not modified" etc. — harmless
}

export function answer(callbackId: string, text?: string) {
  return call("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) }).catch(() => null);
}

export function deleteMessage(chatId: number, messageId: number) {
  return call("deleteMessage", { chat_id: chatId, message_id: messageId }).catch(() => null);
}

export function typing(chatId: number) {
  return call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => null);
}

export async function downloadFile(fileId: string): Promise<Uint8Array> {
  const file = await call<{ file_path: string; file_size?: number }>("getFile", { file_id: fileId });
  const res = await fetch(`${BASE}/file/bot${botToken()}/${file.file_path}`);
  if (!res.ok) throw new Error(`Couldn't download the file from Telegram (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

export function getMe() {
  return call<{ username: string; first_name: string }>("getMe", {});
}

export function setWebhook(url: string) {
  return call("setWebhook", {
    url,
    secret_token: webhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}

export function webhookInfo() {
  return call<{ url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number }>("getWebhookInfo", {});
}

export function setCommands() {
  return call("setMyCommands", {
    commands: [
      { command: "review", description: "Sort transactions the AI wasn't sure about" },
      { command: "summary", description: "This month: income, spending, top categories" },
      { command: "today", description: "Follow-ups and content due" },
      { command: "owe", description: "Who owes you money" },
      { command: "digest", description: "Send the morning reminder now" },
      { command: "help", description: "What I can do" },
    ],
  }).catch(() => null);
}

/** Escape text for Telegram's HTML mode. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
