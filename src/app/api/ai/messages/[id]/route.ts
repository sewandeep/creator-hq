import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/** The chat checks here until the assistant's answer is ready. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: m } = await supabase.from("ai_messages").select("content, attachments, proposal_ids, created_at").eq("id", id).maybeSingle();
  if (!m) return NextResponse.json({ pending: false, content: "⚠️ That message wasn't found." });

  const pending = Array.isArray(m.attachments) && m.attachments.some((a) => a && typeof a === "object" && "pending" in a);
  if (pending) {
    // If the background work died (it has a 5-minute limit), stop waiting.
    if (Date.now() - new Date(m.created_at).getTime() > 6 * 60_000) {
      const content = "⚠️ This took too long and stopped. Please try again — maybe with a shorter question or a smaller file.";
      await supabase.from("ai_messages").update({ content, attachments: [] }).eq("id", id);
      return NextResponse.json({ pending: false, content, proposals: [] });
    }
    return NextResponse.json({ pending: true });
  }
  const { data: proposals } = m.proposal_ids.length
    ? await supabase.from("ai_proposals").select("id, kind, summary, payload, status, result").in("id", m.proposal_ids)
    : { data: [] };
  return NextResponse.json({ pending: false, content: m.content, proposals: proposals ?? [] });
}
