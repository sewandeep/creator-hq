"use client";

import { useEffect, useState } from "react";
import { stopJob, type JobView } from "@/lib/use-job";

/** Live steps of a background job, with a Stop button. */
export function JobProgress({ job, fallback = "Starting…", compact = false }: { job: JobView | null; fallback?: string; compact?: boolean }) {
  const [stopping, setStopping] = useState(false);
  const [now, setNow] = useState(0);
  const started = job?.created_at ? new Date(job.created_at).getTime() : 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const steps = job?.steps ?? [];
  const shown = compact ? steps.slice(-1) : steps.slice(-4);
  const seconds = started && now ? Math.max(0, Math.round((now - started) / 1000)) : null;
  const running = !job || job.status === "running";

  return (
    <div className="space-y-1 text-sm">
      {shown.length === 0 && <Line text={fallback} live />}
      {shown.map((s, i) => (
        <Line key={`${s.at}-${i}`} text={s.text} live={running && i === shown.length - 1} />
      ))}
      {running && job && (
        <div className="flex items-center gap-3 pt-1 text-xs text-slate-400">
          {seconds !== null && <span className="tabular-nums">{seconds}s</span>}
          <button
            type="button"
            disabled={stopping || job.cancel_requested}
            onClick={async () => {
              setStopping(true);
              await stopJob(job.id);
            }}
            className="rounded-full px-2 py-0.5 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-rose-600 disabled:opacity-60"
          >
            {stopping || job.cancel_requested ? "Stopping…" : "Stop"}
          </button>
          <span className="hidden sm:inline">You can leave — it keeps going and shows in Activity.</span>
        </div>
      )}
    </div>
  );
}

function Line({ text, live }: { text: string; live?: boolean }) {
  return (
    <p className={`flex items-center gap-2 ${live ? "text-slate-700" : "text-slate-400"}`}>
      {live ? (
        <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      ) : (
        <span className="w-3 shrink-0 text-center text-emerald-500">✓</span>
      )}
      <span className="min-w-0">{text}</span>
    </p>
  );
}
