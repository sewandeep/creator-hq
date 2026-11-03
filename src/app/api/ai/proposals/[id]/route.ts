import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { applyProposal, cancelProposal } from "@/lib/ai/apply";
import { createJob, runJob } from "@/lib/jobs";

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
  const { data: prop } = await supabase.from("ai_proposals").select("status, summary").eq("id", id).maybeSingle();
  if (!prop) return NextResponse.json({ ok: false, message: "That action wasn't found." });
  if (prop.status !== "pending") return NextResponse.json({ ok: prop.status === "applied", message: prop.status === "applied" ? "Already done." : "This action can't be confirmed any more." });

  const jobId = await createJob(supabase, { kind: "apply", title: `Confirmed: ${prop.summary}`.slice(0, 200), refId: id });
  await supabase.from("ai_proposals").update({ result: { working: true, jobId } }).eq("id", id);
  after(async () => {
    // The job's id tags every change it makes, so Activity can undo it as one.
    await runJob(
      supabase,
      userId,
      jobId,
      async (job) => {
        await job.step("Saving");
        const r = await applyProposal(job.db, userId, id, { edits: body.edits, password: body.password?.trim() || undefined, job });
        if (r.needsPassword) {
          await job.db.from("ai_proposals").update({ result: { needsPassword: true, message: r.message } }).eq("id", id);
          return { summary: r.message };
        }
        if (!r.ok) throw new Error(r.message);
        return { summary: r.message };
      },
      {
        onFail: async (message, cancelled, db) => {
          await db.from("ai_proposals").update({ status: "failed", result: { ok: false, message: cancelled ? "Stopped." : message.replace(/^Something went wrong: /, "") } }).eq("id", id).neq("status", "applied");
        },
      },
    );
    revalidatePath("/", "layout");
  });
  return NextResponse.json({ working: true, jobId });
}

/** The card checks here until the action has finished. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("ai_proposals").select("status, result").eq("id", id).maybeSingle();
  const { data: job } = await supabase.from("jobs").select("id").eq("ref_id", id).eq("kind", "apply").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json(data ? { ...data, jobId: job?.id ?? null } : { status: "failed", result: { message: "Not found." } });
}
