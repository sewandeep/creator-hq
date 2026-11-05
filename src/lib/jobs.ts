import "server-only";
import type { DB } from "@/app/actions/helpers";
import { AiError } from "@/lib/finance/gemini";
import { FormError } from "@/lib/forms";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

// Every background task (AI answer, statement read, confirmed change, Telegram
// message, morning check) runs as a "job": it has a live status and steps you
// can watch, a Stop button, a time limit, and a record in Activity afterwards.
// Changes a job makes are tagged with its id, so the whole job can be undone.

export type JobKind = "chat" | "statement" | "apply" | "rundown" | "telegram" | "daily";

export class JobCancelled extends Error {
  constructor() {
    super("Stopped.");
  }
}

/** Vercel stops a request after 300s; finish (or fail clearly) well before that. */
const DEADLINE_MS = 270_000;
/** A job that hasn't reported anything for this long was cut off by the server. */
const STALE_MS = 6 * 60_000;

export type JobCtx = {
  id: string;
  /** Database client whose changes are recorded under this job (so Undo can reverse them). */
  db: DB;
  /** Adds a progress line. Throws JobCancelled if you pressed Stop. */
  step: (text: string) => Promise<void>;
  /** Throws JobCancelled if you pressed Stop (without adding a line). */
  checkpoint: () => Promise<void>;
  /** The answer so far, shown live while it's being written (optional). */
  partial?: (text: string) => void;
};

export async function createJob(
  db: DB,
  o: { kind: JobKind; title: string; source?: "app" | "telegram" | "auto"; refId?: string | null; userId?: string },
): Promise<string> {
  const { data, error } = await db
    .from("jobs")
    .insert({ kind: o.kind, title: o.title.slice(0, 200), source: o.source ?? "app", ref_id: o.refId ?? null, ...(o.userId ? { user_id: o.userId } : {}) })
    .select("id")
    .single();
  if (error && /jobs|schema cache|does not exist/i.test(error.message)) {
    throw new FormError("One database update is missing — open Setup check in the app and run the “Safety net” file in Supabase.");
  }
  if (error || !data) throw new Error(`Couldn't start the task: ${error?.message ?? "unknown error"}`);
  return data.id;
}

/** A database client whose changes are tagged with the job (admin client when available). */
export function jobClient(userId: string, jobId: string, fallback: DB): DB {
  if (isAdminConfigured()) return createAdminClient(userId, { "x-job-id": jobId });
  return fallback;
}

export function friendlyError(e: unknown) {
  if (e instanceof JobCancelled) return "Stopped.";
  if (e instanceof AiError || e instanceof FormError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  return `Something went wrong: ${msg}`;
}

/**
 * Runs `work` as a job. Never throws: failures, Stop and the time limit all end
 * up as the job's status, with a readable message.
 */
export async function runJob(
  base: DB,
  userId: string,
  jobId: string,
  work: (job: JobCtx) => Promise<{ summary?: string; result?: Json } | void>,
  hooks: { onFail?: (message: string, cancelled: boolean, db: DB) => Promise<void> } = {},
): Promise<"done" | "failed" | "cancelled"> {
  const db = jobClient(userId, jobId, base);
  const isCancelled = async (flag?: boolean | null) => {
    if (flag) throw new JobCancelled();
  };
  // Live text: written at most ~4 times a second, in order.
  let chain: Promise<unknown> = Promise.resolve();
  let pendingText: string | null = null;
  let lastWrite = 0;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    flushTimer = undefined;
    lastWrite = Date.now();
    const text = pendingText;
    pendingText = null;
    if (text === null) return;
    chain = chain.then(() => db.from("jobs").update({ summary: text, updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "running"));
  };
  const ctx: JobCtx = {
    id: jobId,
    db,
    partial: (text) => {
      pendingText = text;
      if (Date.now() - lastWrite > 250) flush();
      else flushTimer ??= setTimeout(flush, 250);
    },
    step: async (text) => {
      const { data } = await db.rpc("job_step", { p_job: jobId, p_text: text });
      await isCancelled(data as boolean | null);
    },
    checkpoint: async () => {
      const { data } = await db.from("jobs").select("cancel_requested").eq("id", jobId).maybeSingle();
      await isCancelled(data?.cancel_requested);
    },
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("TIMEOUT")), DEADLINE_MS);
  });

  try {
    const out = (await Promise.race([work(ctx), deadline])) ?? {};
    clearTimeout(flushTimer);
    await chain;
    await db
      .from("jobs")
      .update({ status: "done", summary: out.summary ?? null, result: out.result ?? null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "running");
    return "done";
  } catch (e) {
    const cancelled = e instanceof JobCancelled;
    const timedOut = e instanceof Error && e.message === "TIMEOUT";
    const message = timedOut ? "Took longer than 4½ minutes, so it was stopped. Nothing after the last step was saved — try again." : friendlyError(e);
    if (!cancelled && !timedOut) console.error(`job ${jobId} failed`, e);
    await db
      .from("jobs")
      .update({ status: cancelled ? "cancelled" : "failed", error: cancelled ? null : message, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "running");
    await hooks.onFail?.(message, cancelled, db).catch(() => {});
    return cancelled ? "cancelled" : "failed";
  } finally {
    clearTimeout(timer);
  }
}

/** Jobs the server cut off (no word for 6+ minutes) are marked failed, so nothing hangs forever. */
export async function sweepStaleJobs(db: DB) {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  await db
    .from("jobs")
    .update({ status: "failed", error: "The server stopped this before it finished. Try again.", finished_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("updated_at", cutoff);
}
