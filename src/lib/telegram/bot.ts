import "server-only";
import type { DB } from "@/app/actions/helpers";
import { suggestPattern } from "@/lib/finance/categorize";
import { ensureCategories, type Category } from "@/lib/finance/categories-server";
import { runAssistant } from "@/lib/ai/assistant";
import type { JobCtx } from "@/lib/jobs";
import { applyProposal, cancelProposal } from "@/lib/ai/apply";
import type { InFile } from "@/lib/ai/files";
import { mdToTelegram } from "@/lib/ai/format";
import { isQuickEntry } from "@/lib/ai/route-input";
import { applyCategory, logChange, quickAddCore } from "@/lib/finance/entries";
import { AiError } from "@/lib/finance/gemini";
import { processStatement, type ProcessResult } from "@/lib/finance/process";
import { monthLabel, monthRange, summarize, loadTxns } from "@/lib/finance/report";
import { addDays, fmtDate, rupees, todayIST } from "@/lib/format";
import { FormError } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { answer, deleteMessage, downloadFile, edit, esc, send, setCommands, typing, type Keyboard } from "./api";
import { buildDigest, digestText, type BotState } from "./digest";

type TgUser = { id: number };
type TgMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; mime_type?: string; file_size?: number };
  audio?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  photo?: { file_id: string; file_size?: number; width: number }[];
};
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; data?: string; message?: TgMessage; from: TgUser };
};

type Owner = { userId: string; chatId: number; state: BotState; reminders: { digest?: boolean; statements?: boolean }; db: DB; job?: JobCtx };

export function appUrl() {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return u.replace(/\/+$/, "");
}

const QUICK_OUT = ["Food & dining", "Groceries", "Fuel", "Travel & cabs", "Studio & equipment", "EMI & loans", "Family", "Lent money", "Self transfer", "Pass-through"];
const QUICK_IN = ["Creator income", "Freelance income", "Sajilo income", "Other income", "Family", "Money returned", "Borrowed", "Self transfer", "Pass-through"];

const HELP = `<b>Here's what I can do</b>

✨ <b>Ask me anything</b> — "how much did I spend on food in October?", "who owes me money?", "add a deal with Noise, 1 reel, 25k, due 20 Nov", "give me a rundown of this week". Send voice notes, photos of bills, brand emails, briefs, Excel sheets or your 26AS too. I always ask before saving anything.

💬 <b>Log money</b> — just type it:
• <code>450 cab</code>
• <code>200 chai cash</code>
• <code>lent 2000 to rahul</code> · <code>rahul returned 2000</code>
• <code>got 5000 from priya</code> · <code>1.2k groceries yesterday</code>

📄 <b>Bank statement</b> — forward the PDF from your bank's email or app. I read it, check the balances and sort it.

/review — sort the transactions the AI wasn't sure about
/summary — this month at a glance
/today — follow-ups, content due, reminders
/owe — who owes you money`;

/** Handles one Telegram update. Long work (reading a statement) is returned to run after replying. */
export async function handleUpdate(update: TgUpdate, job?: JobCtx): Promise<(() => Promise<void>) | void> {
  const msg = update.message ?? update.callback_query?.message;
  const chatId = msg?.chat.id;
  if (!chatId || msg?.chat.type !== "private") return;

  const owner = await findOwner(chatId, job);
  if (!owner) {
    const text = update.message?.text?.trim() ?? "";
    const code = text.match(/^\/start\s+([A-Za-z0-9_-]{6,64})$/)?.[1];
    if (code && (await linkChat(code, chatId))) {
      await setCommands();
      await send(chatId, `✅ <b>Connected!</b> This chat is now linked to your Creator HQ.\n\n${HELP}`);
    } else {
      await send(chatId, "🔒 This is a private bot. To connect it, open Creator HQ → Settings → Telegram and tap “Connect”.");
    }
    return;
  }

  if (update.callback_query) return onCallback(owner, update.callback_query.id, update.callback_query.data ?? "", update.callback_query.message!);
  if (update.message) return onMessage(owner, update.message);
}

// ---------------------------------------------------------------------------
/** Whose chat this is. Changes go through the job's client, so Activity can undo them. */
export async function findOwner(chatId: number, job?: JobCtx): Promise<Owner | null> {
  const { data } = await createAdminClient().from("profile").select("user_id, telegram_state, reminders").eq("telegram_chat_id", chatId).maybeSingle();
  if (!data) return null;
  return {
    userId: data.user_id,
    chatId,
    state: (data.telegram_state ?? {}) as BotState,
    reminders: (data.reminders ?? {}) as Owner["reminders"],
    db: job?.db ?? createAdminClient(data.user_id),
    job,
  };
}

async function linkChat(code: string, chatId: number) {
  const admin = createAdminClient();
  const { data } = await admin.from("profile").select("user_id, telegram_link_expires").eq("telegram_link_code", code).maybeSingle();
  if (!data || !data.telegram_link_expires || data.telegram_link_expires < new Date().toISOString()) return false;
  const { error } = await admin
    .from("profile")
    .update({ telegram_chat_id: chatId, telegram_link_code: null, telegram_link_expires: null, telegram_state: {} })
    .eq("user_id", data.user_id);
  return !error;
}

async function saveState(o: Owner, patch: Partial<BotState>) {
  o.state = { ...o.state, ...patch };
  for (const k of Object.keys(o.state) as (keyof BotState)[]) if (o.state[k] === undefined) delete o.state[k];
  await createAdminClient().from("profile").update({ telegram_state: o.state }).eq("user_id", o.userId);
}

// ---------------------------------------------------------------------------
async function onMessage(o: Owner, m: TgMessage): Promise<(() => Promise<void>) | void> {
  // Files: voice notes, photos, PDFs, sheets → the assistant.
  const incoming = m.voice
    ? { fileId: m.voice.file_id, name: "voice-note.ogg", mime: m.voice.mime_type ?? "audio/ogg", size: m.voice.file_size }
    : m.audio
      ? { fileId: m.audio.file_id, name: m.audio.file_name ?? "audio", mime: m.audio.mime_type ?? "audio/mpeg", size: m.audio.file_size }
      : m.photo?.length
        ? { fileId: m.photo[m.photo.length - 1].file_id, name: "photo.jpg", mime: "image/jpeg", size: m.photo[m.photo.length - 1].file_size }
        : m.document
          ? { fileId: m.document.file_id, name: m.document.file_name ?? "file", mime: m.document.mime_type ?? "application/octet-stream", size: m.document.file_size }
          : null;
  if (incoming) {
    if ((incoming.size ?? 0) > 15 * 1024 * 1024) return void (await send(o.chatId, "That file is over 15 MB — send a smaller one (e.g. one month of statement)."));
    const caption = (m.caption ?? "").trim();
    const isPdf = incoming.mime === "application/pdf" || /\.pdf$/i.test(incoming.name);
    await typing(o.chatId);
    return async () => {
      const bytes = await downloadFile(incoming.fileId);
      try {
        await askAssistant(o, caption, [{ name: incoming.name, mime: incoming.mime, bytes }]);
      } catch (e) {
        // If the AI is unavailable, statements still go through the normal reader.
        if (isPdf && e instanceof AiError) return pdfFallback(o, { fileId: incoming.fileId, fileName: incoming.name });
        throw e;
      }
    };
  }

  const text = (m.text ?? m.caption ?? "").trim();
  if (!text) return;

  // Waiting for a PDF password for a statement the assistant is importing.
  if (o.state.awaiting === "password" && o.state.proposalId && !text.startsWith("/")) {
    const proposalId = o.state.proposalId;
    await saveState(o, { awaiting: undefined, proposalId: undefined });
    await deleteMessage(o.chatId, m.message_id);
    await send(o.chatId, "🔑 Trying that password…");
    return async () => confirmProposal(o, proposalId, undefined, text);
  }

  // Waiting for a PDF password.
  if (o.state.awaiting === "password" && o.state.statementId && !text.startsWith("/")) {
    const statementId = o.state.statementId;
    await saveState(o, { awaiting: undefined, statementId: undefined });
    await deleteMessage(o.chatId, m.message_id);
    await send(o.chatId, "🔑 Trying that password…");
    return async () => reportStatement(o, await processStatement(o.db, statementId, text, o.job));
  }

  const cmd = text.match(/^\/(\w+)/)?.[1]?.toLowerCase();
  switch (cmd) {
    case "start":
    case "help":
      return void (await send(o.chatId, HELP));
    case "review":
      await saveState(o, { reviewSkip: [] });
      return void (await sendNextReview(o));
    case "summary":
      return void (await sendSummary(o));
    case "owe":
      return void (await sendOwe(o));
    case "today":
    case "digest": {
      const d = await buildDigest(o.db, o.userId, o.state, o.reminders);
      if (!d.lines.length) return void (await send(o.chatId, "✨ Nothing needs you today."));
      await send(o.chatId, digestText(d.lines), d.keyboard);
      if (d.recapFor) await saveState(o, { lastRecap: d.recapFor });
      return;
    }
    case undefined:
      break;
    default:
      return void (await send(o.chatId, `I don't know /${esc(cmd)}. Send /help to see what I can do.`));
  }

  // Questions and instructions → the assistant. Simple notes like "450 cab" are saved straight away.
  if (!isQuickEntry(text, todayIST())) {
    await typing(o.chatId);
    return async () => {
      // A failure is reported in the chat (and shown in Activity) by the job.
      await askAssistant(o, text, []);
    };
  }

  // A quick entry like "450 cab".
  try {
    const r = await quickAddCore(o.db, text, "telegram");
    const cats = await ensureCategories(o.db);
    if (!r.category) {
      await send(o.chatId, `📝 ${esc(r.message)}\nWhat was it for?`, categoryKeyboard(cats, r.id, r.parsed.direction, "c", true));
    } else {
      await send(o.chatId, `✅ ${esc(r.message)}`, [[{ text: "Change category", callback_data: `cat:${r.id}` }, { text: "↩️ Undo", callback_data: `undo:${r.id}` }]]);
    }
  } catch (e) {
    if (e instanceof FormError) await send(o.chatId, `🤔 ${esc(e.message)}\n\nSend /help for examples.`);
    else throw e;
  }
}

// ---------------------------------------------------------------------------
async function onCallback(o: Owner, callbackId: string, data: string, m: TgMessage): Promise<(() => Promise<void>) | void> {
  const [action, id, arg] = data.split(":");
  const cats = await ensureCategories(o.db);

  switch (action) {
    case "ap": {
      await answer(callbackId, "Working on it…");
      await edit(o.chatId, m.message_id, `${m.text ? esc(m.text) : "Action"}\n\n⏳ Working on it…`);
      return async () => confirmProposal(o, id, m.message_id);
    }
    case "ax": {
      await cancelProposal(o.db, o.userId, id);
      await answer(callbackId, "Cancelled");
      return void (await edit(o.chatId, m.message_id, `${m.text ? esc(m.text) : "Action"}\n\n✖ Cancelled`));
    }
    case "snooze": {
      const until = addDays(todayIST(), Number(id) || 3);
      await saveState(o, { snoozeStatementsUntil: until });
      return void (await answer(callbackId, `Okay — I'll remind you again on ${fmtDate(until)}.`));
    }
    case "review":
      await answer(callbackId);
      await saveState(o, { reviewSkip: [] });
      return void (await sendNextReview(o));
    case "acct": {
      const file = o.state.pendingFile;
      const { data: accounts } = await o.db.from("bank_accounts").select("id, name").eq("user_id", o.userId).eq("is_archived", false).order("created_at");
      const acc = accounts?.[Number(id)];
      await answer(callbackId);
      if (!file || !acc) return void (await send(o.chatId, "Please send the PDF again."));
      await saveState(o, { pendingFile: undefined });
      await edit(o.chatId, m.message_id, `Account: <b>${esc(acc.name)}</b>`);
      return startStatement(o, file, acc.id, acc.name);
    }
    case "c": // category for a just-typed entry
    case "rc": { // category from the review flow
      const cat = cats[Number(arg)];
      const t = await getTxn(o, id);
      if (!cat || !t) return void (await answer(callbackId, "That one's gone."));
      const r = await applyCategory(o.db, { transactionId: t.id, categoryId: cat.id });
      await answer(callbackId, r.error ?? "Saved");
      const keyboard: Keyboard = [];
      if (t.source === "statement") keyboard.push([{ text: `🔁 Always for “${suggestPattern(t).slice(0, 30)}”`, callback_data: `rem:${t.id}` }]);
      if (action === "c") keyboard.push([{ text: "↩️ Undo", callback_data: `undo:${t.id}` }]);
      await edit(o.chatId, m.message_id, `${txnLine(t)}\n✓ ${cat.emoji ?? ""} <b>${esc(cat.name)}</b>`, keyboard);
      if (action === "rc") await sendNextReview(o);
      return;
    }
    case "more":
    case "cat": {
      const t = await getTxn(o, id);
      await answer(callbackId);
      if (!t) return;
      const mode = action === "cat" ? "c" : arg === "rc" ? "rc" : "c";
      return void (await edit(o.chatId, m.message_id, `${txnLine(t)}\nPick a category:`, categoryKeyboard(cats, t.id, t.direction as "debit" | "credit", mode, false)));
    }
    case "keep": {
      const t = await getTxn(o, id);
      if (t) {
        await o.db.from("transactions").update({ needs_review: false, review_reason: null }).eq("id", t.id).eq("user_id", o.userId);
        await logChange(o.db, t.id, "reviewed", null, "kept the suggested category", "user");
        await edit(o.chatId, m.message_id, `${txnLine(t)}\n✓ Kept the suggestion`);
      }
      await answer(callbackId, "Kept");
      return void (await sendNextReview(o));
    }
    case "skip": {
      const skip = [...(o.state.reviewSkip ?? []), id];
      await saveState(o, { reviewSkip: skip });
      await answer(callbackId, "Skipped");
      await edit(o.chatId, m.message_id, "⏭️ Skipped — it stays on your list.");
      return void (await sendNextReview(o));
    }
    case "rem": {
      const t = await getTxn(o, id);
      if (!t?.category_id) return void (await answer(callbackId, "Pick a category first."));
      const r = await applyCategory(o.db, { transactionId: t.id, categoryId: t.category_id, remember: true });
      return void (await answer(callbackId, r.error ?? `Remembered${r.alsoUpdated ? ` — ${r.alsoUpdated} more updated` : ""}`));
    }
    case "undo": {
      const t = await getTxn(o, id);
      if (!t || t.source === "statement") return void (await answer(callbackId, "Can't undo that one."));
      await o.db.from("transactions").delete().eq("id", t.id).eq("user_id", o.userId);
      await answer(callbackId, "Removed");
      return void (await edit(o.chatId, m.message_id, `↩️ Removed: ${esc(t.description)}`));
    }
    default:
      await answer(callbackId);
  }
}

// ---------------------------------------------------------------------------
async function getTxn(o: Owner, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id ?? "")) return null;
  const { data } = await o.db
    .from("transactions")
    .select("id, source, txn_date, amount, direction, description, counterparty, upi_id, category_id, category_reason, review_reason")
    .eq("id", id)
    .eq("user_id", o.userId)
    .maybeSingle();
  return data;
}

function txnLine(t: { amount: number | string; direction: string; counterparty: string | null; description: string; txn_date: string }) {
  return `${t.direction === "debit" ? "−" : "+"}${rupees(t.amount)} · <b>${esc(t.counterparty || t.description)}</b> · ${fmtDate(t.txn_date, true)}`;
}

function categoryKeyboard(cats: Category[], txnId: string, direction: "debit" | "credit", mode: "c" | "rc", quick: boolean): Keyboard {
  const names = direction === "credit" ? QUICK_IN : QUICK_OUT;
  const list = quick ? names.map((n) => cats.find((c) => c.name === n)).filter((c): c is Category => Boolean(c)) : cats;
  const rows: Keyboard = [];
  for (let i = 0; i < list.length; i += 2) {
    rows.push(list.slice(i, i + 2).map((c) => ({ text: `${c.emoji ?? ""} ${c.name}`.trim(), callback_data: `${mode}:${txnId}:${cats.indexOf(c)}` })));
  }
  if (quick) rows.push([{ text: "More categories…", callback_data: `more:${txnId}:${mode}` }]);
  return rows;
}

async function sendNextReview(o: Owner) {
  const skip = o.state.reviewSkip ?? [];
  let q = o.db
    .from("transactions")
    .select("id, source, txn_date, amount, direction, description, counterparty, upi_id, category_id, category_reason, review_reason, account:bank_accounts(name)", { count: "exact" })
    .eq("user_id", o.userId)
    .eq("needs_review", true)
    .order("txn_date", { ascending: false })
    .limit(1);
  if (skip.length) q = q.not("id", "in", `(${skip.join(",")})`);
  const { data, count } = await q;
  const t = data?.[0];
  if (!t) return send(o.chatId, skip.length ? "That's all for now (you skipped a few — they're still in the app)." : "🎉 All sorted — nothing left to review.");

  const cats = await ensureCategories(o.db);
  const guess = cats.find((c) => c.id === t.category_id);
  const keyboard = categoryKeyboard(cats, t.id, t.direction as "debit" | "credit", "rc", true);
  keyboard.push([...(guess ? [{ text: `Keep “${guess.name}”`, callback_data: `keep:${t.id}` }] : []), { text: "Skip", callback_data: `skip:${t.id}` }]);
  return send(
    o.chatId,
    `🧾 <b>${count} to review</b>\n\n${txnLine(t)}\n${t.account?.name ? `${esc(t.account.name)} · ` : ""}<i>${esc(t.description.slice(0, 120))}</i>\n${t.review_reason ? `\n${esc(t.review_reason)}` : ""}${t.category_reason ? `\n<i>${esc(t.category_reason)}</i>` : ""}`,
    keyboard,
  );
}

async function sendSummary(o: Owner) {
  const ym = todayIST().slice(0, 7);
  const { from, to } = monthRange(ym);
  const s = summarize(await loadTxns(o.db, from, to, o.userId));
  const top = s.spendingCats.slice(0, 6).map((c) => `• ${c.emoji ?? ""} ${esc(c.name)} — ${rupees(c.amount)}`).join("\n");
  await send(
    o.chatId,
    `📊 <b>${monthLabel(ym)} so far</b>\n\nIncome: <b>${rupees(s.income)}</b>\nSpent: <b>${rupees(s.spent)}</b>\nInvested: ${rupees(s.invested)}\nLeft over: <b>${rupees(s.income - s.spent - s.invested)}</b>\n\n${top || "No spending recorded yet."}${s.sajilo.in || s.sajilo.out ? `\n\n🏢 <b>Sajilo</b> (kept separate): in ${rupees(s.sajilo.in)} · out ${rupees(s.sajilo.out)} · net <b>${rupees(s.sajilo.net)}</b>` : ""}${s.unclear.length ? `\n\n🧾 ${s.unclear.length} still to review — /review` : ""}`,
    [[{ text: "Open in app", url: `${appUrl()}/money` }]].filter(() => Boolean(appUrl())),
  );
}

async function sendOwe(o: Owner) {
  const cats = await ensureCategories(o.db);
  const ids = cats.filter((c) => c.kind === "lending").map((c) => c.id);
  const { data } = await o.db.from("transactions").select("amount, direction, person, source, matched_txn_id").eq("user_id", o.userId).in("category_id", ids);
  const per = new Map<string, number>();
  for (const t of data ?? []) {
    if (t.source !== "statement" && t.matched_txn_id) continue;
    const name = t.person?.trim() || "Not named yet";
    per.set(name, (per.get(name) ?? 0) + (t.direction === "debit" ? Number(t.amount) : -Number(t.amount)));
  }
  const owing = [...per.entries()].filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => b[1] - a[1]);
  await send(
    o.chatId,
    owing.length
      ? `🤝 <b>Lending</b>\n\n${owing.map(([n, v]) => (v > 0 ? `• ${esc(n)} owes you <b>${rupees(v)}</b>` : `• You owe ${esc(n)} <b>${rupees(-v)}</b>`)).join("\n")}`
      : "🤝 Nobody owes you anything right now.",
  );
}

// ---------------------------------------------------------------------------
function startStatement(o: Owner, file: { fileId: string; fileName: string }, accountId: string, accountName: string) {
  return async () => {
    await send(o.chatId, `📥 Got it — reading <b>${esc(file.fileName)}</b> for ${esc(accountName)}. This takes about a minute…`);
    await typing(o.chatId);
    try {
      const bytes = await downloadFile(file.fileId);
      const path = `${o.userId}/${crypto.randomUUID()}.pdf`;
      const { error: upError } = await o.db.storage.from("statements").upload(path, bytes, { contentType: "application/pdf" });
      if (upError) throw new Error(upError.message);
      const { data: st, error } = await o.db.from("statements").insert({ account_id: accountId, file_path: path, file_name: file.fileName.slice(0, 200) }).select("id").single();
      if (error) throw new Error(error.message);
      const r = await processStatement(o.db, st.id, undefined, o.job);
      if (r.status === "needs_password") {
        await saveState(o, { awaiting: "password", statementId: st.id });
        return void (await send(o.chatId, `🔒 ${esc(r.message)}\n\nSend the password as your next message. It's saved for this account, so you won't need it again — and I'll delete your message right away.`));
      }
      await reportStatement(o, r);
    } catch (e) {
      await send(o.chatId, `⚠️ Couldn't read that statement: ${esc(e instanceof Error ? e.message : String(e))}`);
    }
  };
}

async function reportStatement(o: Owner, r: ProcessResult) {
  if (r.status === "needs_password") {
    // Wrong password — ask again.
    const { data } = await o.db.from("statements").select("id").eq("user_id", o.userId).eq("status", "needs_password").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) await saveState(o, { awaiting: "password", statementId: data.id });
    return void (await send(o.chatId, `🔒 ${esc(r.message)} Send the password again.`));
  }
  if (r.status !== "done") return void (await send(o.chatId, `⚠️ ${esc(r.message)}`));
  const lines = [
    `✅ <b>${esc(r.message)}</b>`,
    `${r.added} new${r.duplicates ? ` · ${r.duplicates} already imported` : ""}`,
    r.balanceOk ? "✓ Balance check passed" : "⚠️ Balance check found problems — have a look in the app",
    ...(r.issues ?? []).map((i) => `• ${esc(i)}`),
    r.review ? `\n🧾 <b>${r.review}</b> need you.` : "\nEverything was categorised. 🎉",
  ];
  await send(o.chatId, lines.join("\n"), r.review ? [[{ text: "Review now", callback_data: "review" }]] : undefined);
}

// ---------------------------------------------------------------------------
// Assistant
// ---------------------------------------------------------------------------
async function askAssistant(o: Owner, text: string, files: InFile[]) {
  await typing(o.chatId);
  const r = await runAssistant(o.db, o.userId, { text, files, channel: "telegram", job: o.job });
  await send(o.chatId, mdToTelegram(r.reply) || "👍");
  for (const p of r.proposals) {
    const url = appUrl();
    await send(o.chatId, `📝 <b>Ready to save — please check:</b>\n${esc(p.summary)}`, [
      [
        { text: "✅ Confirm", callback_data: `ap:${p.id}` },
        { text: "✖ Cancel", callback_data: `ax:${p.id}` },
      ],
      ...(url ? [[{ text: "✏️ Edit in app", url: `${url}/ask` }]] : []),
    ]);
  }
}

async function confirmProposal(o: Owner, proposalId: string, messageId?: number, password?: string) {
  const r = await applyProposal(o.db, o.userId, proposalId, { password });
  if (r.needsPassword) {
    await saveState(o, { awaiting: "password", proposalId });
    return void (await send(o.chatId, `🔒 ${esc(r.message)}\n\nSend the PDF password as your next message — I'll delete it right away and remember it for this account.`));
  }
  const url = appUrl();
  const text = r.ok ? `✅ ${esc(r.message)}` : `⚠️ ${esc(r.message)}`;
  const keyboard = r.ok && r.link && url ? [[{ text: "Open in app", url: `${url}${r.link}` }]] : undefined;
  if (messageId) await edit(o.chatId, messageId, text, keyboard);
  else await send(o.chatId, text, keyboard);
  if (r.ok && r.link === "/money/review") await send(o.chatId, "Want to sort the unclear ones now?", [[{ text: "Review now", callback_data: "review" }]]);
}

/** Without AI: ask which account, then read the statement directly. */
async function pdfFallback(o: Owner, file: { fileId: string; fileName: string }) {
  const { data: accounts } = await o.db.from("bank_accounts").select("id, name").eq("user_id", o.userId).eq("is_archived", false).order("created_at");
  if (!accounts?.length) return void (await send(o.chatId, `First add your bank account in the app: ${appUrl()}/money/statements`));
  if (accounts.length === 1) return startStatement(o, file, accounts[0].id, accounts[0].name)();
  await saveState(o, { pendingFile: file });
  await send(o.chatId, "Which account is this statement for?", accounts.map((a, i) => [{ text: a.name, callback_data: `acct:${i}` }]));
}

