import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { processStatement } from "@/lib/finance/process";
import { createJob, runJob } from "@/lib/jobs";

// Reading a long statement can take a while — it runs in the background as a
// job (live steps, Stop button, shows in Activity). The page watches the job.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await requireUser();
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const { data: st } = await supabase.from("statements").select("id, file_name, status").eq("id", id).maybeSingle();
  if (!st) return NextResponse.json({ status: "failed", message: "Statement not found." });

  // Already being read? Watch that one instead of starting a second read.
  const { data: running } = await supabase.from("jobs").select("id").eq("ref_id", id).eq("status", "running").maybeSingle();
  if (running) return NextResponse.json({ status: "processing", jobId: running.id });

  // processed_at doubles as "started at" while reading, so a stuck read can be spotted.
  await supabase.from("statements").update({ status: "processing", error: "progress: Starting…", processed_at: new Date().toISOString() }).eq("id", id);
  const jobId = await createJob(supabase, { kind: "statement", title: `Read statement: ${st.file_name ?? "PDF"}`, refId: id });
  after(async () => {
    await runJob(
      supabase,
      userId,
      jobId,
      async (job) => {
        const r = await processStatement(job.db, id, body.password?.trim() || undefined, job);
        if (r.status === "needs_password") return { summary: r.message, result: { needsPassword: true } };
        if (r.status === "failed") throw new Error(r.message);
        return { summary: `${r.message} ${r.added ?? 0} new${r.duplicates ? `, ${r.duplicates} already saved` : ""}${r.review ? `, ${r.review} to sort` : ""}.`, result: r as never };
      },
      {
        onFail: async (message, cancelled, db) => {
          await db.from("statements").update({ status: "failed", error: cancelled ? "Stopped. Tap Try again to read it." : message.replace(/^Something went wrong: /, "") }).eq("id", id);
        },
      },
    );
    revalidatePath("/", "layout");
  });
  return NextResponse.json({ status: "processing", jobId });
}
