import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/finance/gemini";
import { suggestionsFor } from "@/lib/ai/suggestions";
import { Chat, type ChatMessage } from "./chat";
import type { Proposal } from "./proposal-card";

export const metadata: Metadata = { title: "Ask AI" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase } = await requireUser();
  const { data: msgs } = await supabase.from("ai_messages").select("id, role, content, attachments, proposal_ids").eq("channel", "app").order("created_at", { ascending: false }).limit(40);
  const list = (msgs ?? []).reverse();
  const ids = list.flatMap((m) => m.proposal_ids);
  const { data: props } = ids.length ? await supabase.from("ai_proposals").select("id, kind, summary, payload, status, result").in("id", ids) : { data: [] };
  const byId = new Map((props ?? []).map((p) => [p.id, p as unknown as Proposal]));

  const initial: ChatMessage[] = list.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    attachments: (Array.isArray(m.attachments) ? m.attachments.filter((a) => a !== null && typeof a === "object" && "name" in a) : []) as ChatMessage["attachments"],
    proposals: m.proposal_ids.map((id) => byId.get(id)).filter((p): p is Proposal => Boolean(p)),
    pending: Array.isArray(m.attachments) && m.attachments.some((a) => a !== null && typeof a === "object" && "pending" in a),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Ask AI" subtitle="Ask about your deals and money, give instructions, or drop in files and voice notes." />
      {!isAiConfigured() && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Add your Gemini key (GEMINI_API_KEY) to use the assistant — see Setup check.</p>}
      <Chat initial={initial} initialQuery={q?.trim() || null} suggestions={suggestionsFor(null)} />
    </div>
  );
}
