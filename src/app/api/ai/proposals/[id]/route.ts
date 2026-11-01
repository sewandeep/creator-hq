import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { applyProposal, cancelProposal } from "@/lib/ai/apply";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

// Confirming a statement import reads the whole PDF with AI — done in the background.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await requireUser();
  const body = (await req.json().catch(() => ({}))) as { action?: string; edits?: Record<string, unknown>; password?: string };
  if (body.action === "cancel") {
    await cancelProposal(supabase, userId, id);
    return NextResponse.json({ ok: true, message: "Cancelled." });
  }
  const { data: prop } = await supabase.from("ai_proposals").select("status").eq("id", id).maybeSingle();
  if (!prop) return NextResponse.json({ ok: false, message: "That action wasn't found." });
  if (prop.status !== "pending") return NextResponse.json({ ok: prop.status === "applied", message: prop.status === "applied" ? "Already done." : "This action can't be confirmed any more." });

  await supabase.from("ai_proposals").update({ result: { working: true } }).eq("id", id);
  const db = isAdminConfigured() ? createAdminClient(userId) : supabase;
  after(async () => {
    try {
      const r = await applyProposal(db, userId, id, { edits: body.edits, password: body.password?.trim() || undefined });
      if (r.needsPassword) await db.from("ai_proposals").update({ result: { needsPassword: true, message: r.message } }).eq("id", id);
    } catch (e) {
      await db.from("ai_proposals").update({ status: "failed", result: { ok: false, message: e instanceof Error ? e.message : String(e) } }).eq("id", id);
    }
    revalidatePath("/", "layout");
  });
  return NextResponse.json({ working: true });
}

/** The card checks here until the action has finished. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("ai_proposals").select("status, result").eq("id", id).maybeSingle();
  return NextResponse.json(data ?? { status: "failed", result: { message: "Not found." } });
}
