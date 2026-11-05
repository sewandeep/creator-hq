import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/** A job's live status (the page also gets instant updates; this is the backup). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("jobs").select("id, kind, title, status, steps, summary, error, result, ref_id, cancel_requested, created_at, updated_at, finished_at").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ status: "failed", error: "Not found.", steps: [] });
  // Cut off by the server (no word for 6+ minutes)? Say so instead of spinning forever.
  if (data.status === "running" && Date.now() - new Date(data.updated_at).getTime() > 6 * 60_000) {
    const error = "The server stopped this before it finished. Try again.";
    await supabase.from("jobs").update({ status: "failed", error, finished_at: new Date().toISOString() }).eq("id", id).eq("status", "running");
    return NextResponse.json({ ...data, status: "failed", error });
  }
  return NextResponse.json(data);
}

/** Stop button. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "cancel") return NextResponse.json({ ok: false });
  const { data: job } = await supabase.from("jobs").select("id, kind, status, ref_id").eq("id", id).maybeSingle();
  if (!job || job.status !== "running") return NextResponse.json({ ok: true, status: job?.status ?? "missing" });

  await supabase.from("jobs").update({ cancel_requested: true }).eq("id", id);
  // A chat answer saves nothing until the very end, so it can stop right away.
  if (job.kind === "chat" || job.kind === "rundown") {
    await supabase.from("jobs").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", id).eq("status", "running");
    if (job.ref_id) await supabase.from("ai_messages").update({ content: "⏹ Stopped — nothing was saved.", attachments: [] }).eq("id", job.ref_id);
    return NextResponse.json({ ok: true, status: "cancelled" });
  }
  // Statements and confirmed changes stop at their next step (before saving).
  return NextResponse.json({ ok: true, status: "stopping" });
}
