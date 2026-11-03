"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { undoChanges } from "@/app/actions/activity";
import { useAssistant } from "@/components/assistant";
import { JobProgress } from "@/components/job-progress";
import { useJob } from "@/lib/use-job";

export function UndoButton({ groupId, label = "Undo" }: { groupId: string; label?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span className="text-xs text-slate-500">{msg}</span>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await undoChanges(groupId);
          setMsg(r.message);
        })
      }
      className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
    >
      {pending ? "Undoing…" : label}
    </button>
  );
}

/** A job that's still running: live steps, then refresh the list when it ends. */
export function LiveJob({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  const router = useRouter();
  const ended = Boolean(job && job.status !== "running");
  useEffect(() => {
    if (ended) router.refresh();
  }, [ended, router]);
  return <JobProgress job={job} />;
}

export function AskAgain({ text }: { text: string }) {
  const { open } = useAssistant();
  return (
    <button type="button" onClick={() => open(text)} className="rounded-full px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
      Ask again
    </button>
  );
}
