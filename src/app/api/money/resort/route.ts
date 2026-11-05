import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { resortTransactions } from "@/lib/finance/resort";
import { createJob, runJob } from "@/lib/jobs";

export const maxDuration = 300;

/** "Re-sort my transactions": runs in the background as a job (live steps, Undo in Activity). */
export async function POST() {
  const { supabase, userId } = await requireUser();
  const { data: running } = await supabase.from("jobs").select("id").eq("kind", "resort").eq("status", "running").maybeSingle();
  if (running) return NextResponse.json({ jobId: running.id });
  const jobId = await createJob(supabase, { kind: "resort", title: "Re-sort my transactions" });
  after(async () => {
    await runJob(supabase, userId, jobId, (job) => resortTransactions(job.db, userId, job));
    revalidatePath("/", "layout");
  });
  return NextResponse.json({ jobId });
}
