"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JobProgress } from "@/components/job-progress";
import { toast } from "@/components/toast";
import { useJob } from "@/lib/use-job";

/** Re-sorts everything you haven't set yourself, with what the app knows now. */
export function ResortButton({ className = "btn-secondary px-3 py-1.5 text-xs" }: { className?: string }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const router = useRouter();
  const ended = Boolean(job && job.status !== "running");
  useEffect(() => {
    if (!ended || !job) return;
    toast(job.status === "done" ? job.summary ?? "Re-sorted." : job.error ?? "Didn't finish.", { tone: job.status === "done" ? "ok" : "error", undoGroup: job.status === "done" ? job.id : undefined });
    router.refresh();
    const t = setTimeout(() => setJobId(null), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);
  if (jobId)
    return (
      <div className="rounded-xl bg-slate-50 p-3">
        <JobProgress job={job} fallback="Starting…" />
      </div>
    );
  return (
    <button
      type="button"
      className={className}
      title="Uses your rules, what you've sorted before, clear patterns and the AI. Anything unclear stays for you. Can be undone."
      onClick={async () => {
        const r = await fetch("/api/money/resort", { method: "POST" }).then((x) => x.json()).catch(() => null);
        if (r?.jobId) setJobId(r.jobId);
        else toast("Couldn't start — try again.", { tone: "error" });
      }}
    >
      🔄 Re-sort my transactions
    </button>
  );
}
