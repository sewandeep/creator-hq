import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/** The AI panel loads your conversation when it's first opened. */
export async function GET() {
  const { supabase } = await requireUser();
  const { data: msgs } = await supabase.from("ai_messages").select("id, role, content, attachments, proposal_ids").eq("channel", "app").order("created_at", { ascending: false }).limit(40);
  const list = (msgs ?? []).reverse();
  const ids = list.flatMap((m) => m.proposal_ids);
  const { data: props } = ids.length ? await supabase.from("ai_proposals").select("id, kind, summary, payload, status, result").in("id", ids) : { data: [] };
  const byId = new Map((props ?? []).map((p) => [p.id, p]));
  const isObj = (a: unknown): a is Record<string, unknown> => a !== null && typeof a === "object";
  return NextResponse.json(
    list.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      attachments: Array.isArray(m.attachments) ? m.attachments.filter((a) => isObj(a) && "name" in a) : [],
      proposals: m.proposal_ids.map((id) => byId.get(id)).filter(Boolean),
      pending: Array.isArray(m.attachments) && m.attachments.some((a) => isObj(a) && "pending" in a),
    })),
  );
}
