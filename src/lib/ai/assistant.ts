import "server-only";
import type { DB } from "@/app/actions/helpers";
import { AiError, callGemini, type GeminiContent, type GeminiPart } from "@/lib/finance/gemini";
import { isGroqConfigured } from "@/lib/groq";
import { fmtDate, todayIST } from "@/lib/format";
import { fyLabel, fyOf } from "@/lib/fy";
import type { JobCtx } from "@/lib/jobs";
import type { Json } from "@/lib/supabase/database.types";
import { describeContext, type PageContext } from "./context";
import { GROQ_CHAT_MODELS, GroqUnavailable, groqTurn, toOpenAiTools, type ChatMsg } from "./groq-chat";
import { buildSnapshot } from "./snapshot";
import type { InFile } from "./files";
import { TOOL_DECLARATIONS, runTool, type ToolContext } from "./tools";

export type AssistantReply = {
  reply: string;
  proposals: { id: string; kind: string; summary: string }[];
  model: string;
};

function systemPrompt(name: string) {
  const today = todayIST();
  return `You are the assistant inside Creator HQ, a private app for ${name || "an Indian content creator"} who does paid brand collaborations (Instagram/YouTube) and also tracks personal money. They also run a separate business called Sajilo: its money uses the categories "Sajilo income" and "Sajilo expenses" and is kept out of personal income/spending totals (report it separately). Always reply in clear, simple English.

Today is ${fmtDate(today)} (${today}), India time. Current financial year: ${fyLabel(fyOf(today))} (April–March).

How to work:
- Questions about the user's own data (money, deals, brands, invoices, TDS, lending, deadlines): ALWAYS call the read tools first and answer only from what they return. Never invent or estimate numbers that a tool could give you. If a tool returns nothing, say so plainly.
- Changes (new deals, updates, entries, re-categorising, invoices, imports, attaching files): use the propose_* tools. They do NOT save anything — they create a card the user must Confirm. After proposing, briefly say what you prepared and ask them to check and tap Confirm. Never claim something is already saved.
- Before propose_recategorize, find the transaction ids with search_transactions. Before propose_deal_update / propose_invoice_draft / propose_attach_to_deal, find the deal with list_deals or brand_overview. Use exact category names from list_categories.
- Attached files:
  • Bank statement PDF (or any password-protected PDF) → list_bank_accounts, then propose_statement_import into the matching account (match by bank name / last 4 digits; if unsure, ask which account).
  • Form 26AS / AIS → read Part I and propose_tds_from_26as (fy = the financial year the figures belong to; AY 2026-27 means fy 2025).
  • Brand email, DM, brief or contract → summarise the key points (brand, deliverables, fee, dates, usage rights, exclusivity, payment terms) and propose_new_deal (or propose_attach_to_deal if the deal already exists).
  • Receipt, bill or UPI screenshot → propose_entries.
  • Spreadsheet/list of past collaborations → propose_past_work_import.
  • Voice note → understand what was said and act on it (usually propose_entries or a question).
- Money entries: debit = spent / lent / paid; credit = received / got back. Default date is today. Use "Lent money" / "Money returned" with the person's name for lending.
- General questions (Indian tax for creators — TDS sections 194J/194C/194R, GST threshold, advance tax, ITR; pricing; negotiation; writing emails): give practical, accurate help. For tax and legal matters, add one short line suggesting they confirm with their CA.
- When the user tells you something lasting (who a person is, how a payee should be categorised, their rates or preferences), call remember_fact so you know it next time. Use what's in "Things you were told to remember" below.
- Style: short and friendly. Use "₹" with Indian digit grouping (₹1,25,000). Use **bold** for key numbers and "- " bullet lines. No tables, no headings. Keep most answers under 150 words unless a rundown/summary is asked for.`;
}

/** One assistant turn: the user's message (+ files) → reply, with any prepared actions. */
export async function runAssistant(
  db: DB,
  userId: string,
  input: {
    text: string;
    files?: InFile[];
    channel: "app" | "telegram" | "rundown";
    /** What the user is looking at in the app (a deal, brand, transaction…). */
    context?: PageContext | null;
    /** Already-saved chat rows for this turn (the app saves them up front). */
    saved?: { userMessageId: string; replyMessageId: string };
    /** Live progress + Stop button (when run as a job). */
    job?: JobCtx;
  },
): Promise<AssistantReply> {
  const step = async (text: string) => {
    await input.job?.step(text);
  };
  const { data: profile } = await db.from("profile").select("display_name, legal_name").eq("user_id", userId).maybeSingle();
  // File reading (PDF, Excel) is only loaded when a file is actually sent.
  if (input.files?.length) await step(input.files.length === 1 ? `Opening ${input.files[0].name}` : `Opening ${input.files.length} files`);
  const prepared = input.files?.length
    ? await (await import("./files")).prepareFiles(db, userId, input.files)
    : { refs: [] as import("./files").FileRef[], parts: [] as GeminiPart[] };

  // Recent conversation for context.
  const { data: history } = await db
    .from("ai_messages")
    .select("role, content")
    .eq("user_id", userId)
    .eq("channel", input.channel)
    .not("id", "in", `(${input.saved ? [input.saved.userMessageId, input.saved.replyMessageId].join(",") : "00000000-0000-0000-0000-000000000000"})`)
    .neq("content", "")
    .order("created_at", { ascending: false })
    .limit(8);
  const contents: GeminiContent[] = (history ?? [])
    .reverse()
    .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("model" as const), parts: [{ text: m.content.slice(0, 4000) }] }));
  const where = await describeContext(db, userId, input.context ?? null);
  const userParts: GeminiPart[] = [
    ...(where ? [{ text: `[Context: ${where}]` }] : []),
    { text: input.text.trim() || (prepared.refs.length ? "Here's a file — please handle it." : "Hi") },
    ...prepared.parts,
  ];
  contents.push({ role: "user", parts: userParts });

  const ctx: ToolContext = { db, userId, files: prepared.refs, channel: input.channel, proposals: [] };
  const snapshot = (await buildSnapshot(db, userId).catch(() => "")).slice(0, 1500);
  const memory = await loadMemoryFacts(db);
  const system = `${systemPrompt(profile?.display_name || profile?.legal_name || "")}${memory ? `\n\nThings you were told to remember:\n${memory}` : ""}${snapshot ? `\n\nWhere things stand right now (answer from this directly when it's enough; use tools for anything more detailed):\n${snapshot}` : ""}`;
  let reply = "";
  let model = "";

  // Fast path: Groq, streamed. Photos, scanned PDFs and audio without a
  // transcript need Gemini (it can see/hear), so those go straight there.
  const textOnly = prepared.parts.every((p) => !p.inlineData);
  let answered = false;
  if (isGroqConfigured() && textOnly) {
    try {
      const userText = userParts.map((p) => p.text ?? "").filter(Boolean).join("\n\n");
      const recent = (history ?? []).slice(0, 4).reverse().map((m): ChatMsg => ({ role: m.role === "user" ? "user" : "assistant", content: m.content.slice(0, 500) }));
      const r = await groqAssistant({ system, recent, userText, ctx, step, partial: (t) => input.job?.partial?.(t) });
      reply = r.reply;
      model = r.model;
      answered = true;
    } catch (e) {
      if (!(e instanceof GroqUnavailable)) throw e;
      console.warn("groq unavailable, using gemini", e.message);
      await step(`Fast AI (Groq) didn't work — ${e.message.slice(0, 140)} — switching to Gemini`);
      input.job?.partial?.("");
    }
  }

  for (let round = 0; !answered && round < 7; round++) {
    await step(round === 0 ? "Thinking…" : "Thinking about what it found…");
    const res = await callGemini({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      generationConfig: { temperature: 0.3 },
    });
    model = res.model;
    const content = res.json.candidates?.[0]?.content;
    if (!content?.parts?.length) {
      reply = "Sorry — I couldn't come up with an answer. Try asking in a different way.";
      break;
    }
    const calls = content.parts.filter((p) => p.functionCall);
    if (!calls.length) {
      reply = content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
      break;
    }
    // Send the model's turn back exactly as received (it carries hidden "thought signatures").
    contents.push({ role: "model", parts: content.parts });
    const responses: GeminiPart[] = [];
    for (const p of calls) {
      await step(toolLabel(p.functionCall!.name, p.functionCall!.args ?? {}));
      const out = await runTool(p.functionCall!.name, p.functionCall!.args ?? {}, ctx);
      responses.push({ functionResponse: { ...(p.functionCall!.id ? { id: p.functionCall!.id } : {}), name: p.functionCall!.name, response: { result: out } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  if (!reply) reply = ctx.proposals.length ? "I've prepared that below — check it and tap Confirm." : "Sorry, that took too many steps. Could you ask more specifically?";

  await step(ctx.proposals.length ? `Prepared ${ctx.proposals.length === 1 ? "a change" : `${ctx.proposals.length} changes`} for you to confirm` : "Writing the answer");

  // Save the exchange (not for automatic rundowns' prompt).
  if (input.saved) {
    await db
      .from("ai_messages")
      .update({ content: reply, proposal_ids: ctx.proposals.map((p) => p.id), attachments: [] })
      .eq("id", input.saved.replyMessageId);
    if (prepared.refs.length) {
      await db.from("ai_messages").update({ attachments: prepared.refs.map((r) => ({ name: r.name, kind: r.kind })) as unknown as NonNullable<Json> }).eq("id", input.saved.userMessageId);
    }
    return { reply, proposals: ctx.proposals, model };
  }
  if (input.channel !== "rundown") {
    await db.from("ai_messages").insert({
      channel: input.channel,
      role: "user",
      content: input.text.trim() || "(sent a file)",
      attachments: prepared.refs.map((r) => ({ name: r.name, kind: r.kind })) as unknown as NonNullable<Json>,
    });
  }
  await db.from("ai_messages").insert({ channel: input.channel, role: "assistant", content: reply, proposal_ids: ctx.proposals.map((p) => p.id) });
  return { reply, proposals: ctx.proposals, model };
}

/** Facts the user asked the assistant to remember (newest first, kept short). */
async function loadMemoryFacts(db: DB) {
  const { data, error } = await db.from("ai_memory").select("fact").order("created_at", { ascending: false }).limit(30);
  if (error || !data?.length) return "";
  return data.map((m) => `- ${m.fact}`).join("\n").slice(0, 1500);
}

/** The assistant loop on Groq: streamed text, tools, up to 6 rounds. */
async function groqAssistant(o: {
  system: string;
  recent: ChatMsg[];
  userText: string;
  ctx: ToolContext;
  step: (text: string) => Promise<void>;
  partial: (text: string) => void;
}): Promise<{ reply: string; model: string }> {
  const tools = toOpenAiTools(TOOL_DECLARATIONS);
  let last: unknown = null;
  for (const model of GROQ_CHAT_MODELS()) {
    const messages: ChatMsg[] = [{ role: "system", content: o.system }, ...o.recent, { role: "user", content: o.userText }];
    try {
      for (let round = 0; round < 6; round++) {
        await o.step(round === 0 ? "Thinking…" : "Thinking about what it found…");
        const turn = await groqTurn({ model, messages, tools, onText: o.partial });
        if (!turn.toolCalls.length) return { reply: turn.content.trim(), model: `groq:${model}` };
        o.partial("");
        messages.push({ role: "assistant", content: turn.content || null, tool_calls: turn.toolCalls });
        for (const c of turn.toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(c.function.arguments || "{}");
          } catch {
            args = {};
          }
          await o.step(toolLabel(c.function.name, args));
          const out = await runTool(c.function.name, args, o.ctx);
          // Kept short: the free tier counts every word sent.
          messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out).slice(0, 6000) });
        }
      }
      return { reply: o.ctx.proposals.length ? "I've prepared that below — check it and tap Confirm." : "Sorry, that took too many steps. Could you ask more specifically?", model: `groq:${model}` };
    } catch (e) {
      if (!(e instanceof GroqUnavailable)) throw e;
      last = e;
      // Something was already prepared: don't start over (it would prepare it twice).
      if (o.ctx.proposals.length) throw new AiError("The AI stopped halfway. What it prepared so far is below — check it, or ask again.");
    }
  }
  throw last instanceof GroqUnavailable ? last : new GroqUnavailable("no model answered");
}

/** What each tool call looks like in the live progress list. */
function toolLabel(name: string, args: Record<string, unknown>) {
  const a = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : "");
  const range = a("from") && a("to") ? ` (${a("from")} → ${a("to")})` : a("month") ? ` for ${a("month")}` : "";
  const labels: Record<string, string> = {
    get_money_summary: `Adding up your money${range}`,
    search_transactions: `Searching transactions${a("text") ? ` for "${a("text")}"` : ""}${range}`,
    list_deals: "Looking at your deals",
    brand_overview: `Looking up ${a("brand") || "the brand"}`,
    list_invoices: "Checking invoices",
    get_earnings: `Adding up earnings${range}`,
    get_lending: "Checking who owes you",
    get_tds: "Checking TDS",
    get_upcoming: "Checking what's coming up",
    get_rate_stats: "Looking at your rates",
    list_categories: "Reading your categories",
    list_bank_accounts: "Reading your bank accounts",
    propose_new_deal: "Preparing the new deal",
    propose_deal_update: "Preparing the deal update",
    propose_entries: "Preparing the entries",
    propose_recategorize: "Preparing the category changes",
    propose_invoice_draft: "Preparing the invoice",
    propose_statement_import: "Preparing the statement import",
    propose_past_work_import: "Preparing the import",
    propose_attach_to_deal: "Preparing to attach the file",
    remember_fact: "Saving that to memory",
  };
  return labels[name] ?? "Looking things up";
}

export const RUNDOWN_PROMPT =
  "Give me my weekly rundown: what happened with brand deals this past week (new, moved, paid), money in and out this month so far with the biggest spending categories, invoices still unpaid, who owes me, and what's coming up in the next 7 days. Finish with 1–3 short, specific suggestions. Use short bullets.";

/**
 * Setup check: one real question to Groq with the assistant's full set of
 * tools and data summary — reports the exact answer or error per model.
 */
export async function testFastAssistant(db: DB, userId: string): Promise<{ ok: boolean; lines: string[] }> {
  if (!isGroqConfigured()) return { ok: false, lines: ["GROQ_API_KEY isn't set in Vercel."] };
  const snapshot = (await buildSnapshot(db, userId).catch(() => "")).slice(0, 1500);
  const system = `${systemPrompt("")}\n\nWhere things stand right now:\n${snapshot}`;
  const tools = toOpenAiTools(TOOL_DECLARATIONS);
  const approxTokens = Math.round((system.length + JSON.stringify(tools).length + 60) / 3.6) + 700;
  const lines = [`Request size ≈ ${approxTokens.toLocaleString("en-IN")} tokens (free limit: 8,000 a minute).`];
  let ok = false;
  for (const model of GROQ_CHAT_MODELS()) {
    const t0 = Date.now();
    try {
      const r = await groqTurn({ model, tools, messages: [{ role: "system", content: system }, { role: "user", content: "How much did I spend last month?" }] });
      const what = r.toolCalls.length ? `wanted to look up ${r.toolCalls.map((c) => c.function.name).join(", ")}` : `answered: "${r.content.slice(0, 60)}"`;
      lines.push(`✓ ${model}: ${what} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      ok = true;
    } catch (e) {
      lines.push(`✗ ${model}: ${e instanceof Error ? e.message : String(e)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }
  return { ok, lines };
}
