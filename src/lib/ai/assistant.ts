import "server-only";
import type { DB } from "@/app/actions/helpers";
import { callGemini, type GeminiContent, type GeminiPart } from "@/lib/finance/gemini";
import { fmtDate, todayIST } from "@/lib/format";
import { fyLabel, fyOf } from "@/lib/fy";
import type { Json } from "@/lib/supabase/database.types";
import { prepareFiles, type InFile } from "./files";
import { TOOL_DECLARATIONS, runTool, type ToolContext } from "./tools";

export type AssistantReply = {
  reply: string;
  proposals: { id: string; kind: string; summary: string }[];
  model: string;
};

function systemPrompt(name: string) {
  const today = todayIST();
  return `You are the assistant inside Creator HQ, a private app for ${name || "an Indian content creator"} who does paid brand collaborations (Instagram/YouTube) and also tracks personal money. Always reply in clear, simple English.

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
- Style: short and friendly. Use "₹" with Indian digit grouping (₹1,25,000). Use **bold** for key numbers and "- " bullet lines. No tables, no headings. Keep most answers under 150 words unless a rundown/summary is asked for.`;
}

/** One assistant turn: the user's message (+ files) → reply, with any prepared actions. */
export async function runAssistant(db: DB, userId: string, input: { text: string; files?: InFile[]; channel: "app" | "telegram" | "rundown" }): Promise<AssistantReply> {
  const { data: profile } = await db.from("profile").select("display_name, legal_name").eq("user_id", userId).maybeSingle();
  const prepared = input.files?.length ? await prepareFiles(db, userId, input.files) : { refs: [], parts: [] };

  // Recent conversation for context.
  const { data: history } = await db
    .from("ai_messages")
    .select("role, content")
    .eq("user_id", userId)
    .eq("channel", input.channel)
    .order("created_at", { ascending: false })
    .limit(8);
  const contents: GeminiContent[] = (history ?? [])
    .reverse()
    .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("model" as const), parts: [{ text: m.content.slice(0, 4000) }] }));
  const userParts: GeminiPart[] = [{ text: input.text.trim() || (prepared.refs.length ? "Here's a file — please handle it." : "Hi") }, ...prepared.parts];
  contents.push({ role: "user", parts: userParts });

  const ctx: ToolContext = { db, userId, files: prepared.refs, channel: input.channel, proposals: [] };
  let reply = "";
  let model = "";
  for (let round = 0; round < 7; round++) {
    const res = await callGemini({
      systemInstruction: { parts: [{ text: systemPrompt(profile?.display_name || profile?.legal_name || "") }] },
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
      const out = await runTool(p.functionCall!.name, p.functionCall!.args ?? {}, ctx);
      responses.push({ functionResponse: { ...(p.functionCall!.id ? { id: p.functionCall!.id } : {}), name: p.functionCall!.name, response: { result: out } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  if (!reply) reply = ctx.proposals.length ? "I've prepared that below — check it and tap Confirm." : "Sorry, that took too many steps. Could you ask more specifically?";

  // Save the exchange (not for automatic rundowns' prompt).
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

export const RUNDOWN_PROMPT =
  "Give me my weekly rundown: what happened with brand deals this past week (new, moved, paid), money in and out this month so far with the biggest spending categories, invoices still unpaid, who owes me, and what's coming up in the next 7 days. Finish with 1–3 short, specific suggestions. Use short bullets.";
