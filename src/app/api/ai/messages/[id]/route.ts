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
    // The job ended without saving an answer (stopped, timed out, cut off): say so.
    const { data: job } = await supabase.from("jobs").select("status, error").eq("ref_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (job && job.status !== "running") {
      const content = job.status === "cancelled" ? "⏹ Stopped — nothing was saved." : `⚠️ ${job.error ?? "This didn't finish. Please try again."}`;
      await supabase.from("ai_messages").update({ content, attachments: [] }).eq("id", id);
      return NextResponse.json({ pending: false, content, proposals: [] });
    }
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
