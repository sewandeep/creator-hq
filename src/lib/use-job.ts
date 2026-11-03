"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type JobStep = { at: string; text: string };
export type JobView = {
  id: string;
  kind?: string;
  title?: string;
  status: "running" | "done" | "failed" | "cancelled";
  steps: JobStep[];
  summary?: string | null;
  error?: string | null;
  result?: Record<string, unknown> | null;
  ref_id?: string | null;
  cancel_requested?: boolean;
  created_at?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Watches a background job. Updates arrive instantly over a live connection;
 * a slower check runs alongside in case that connection drops (e.g. iPhone
 * putting the page to sleep).
 */
export function useJob(jobId: string | null | undefined): JobView | null {
  const [job, setJob] = useState<JobView | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    finished.current = false;
    const supabase = createClient();
    const channel = supabase
      .channel(`job-${jobId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` }, (payload) => {
        if (stop) return;
        const next = payload.new as JobView;
        if (next.status !== "running") finished.current = true;
        setJob((prev) => ({ ...(prev ?? {}), ...next }));
      })
      .subscribe();

    void (async () => {
      for (let i = 0; !stop && !finished.current; i++) {
        const r = (await fetch(`/api/jobs/${jobId}`)
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null)) as JobView | null;
        if (stop) return;
        if (r?.status) {
          setJob(r);
          if (r.status !== "running") finished.current = true;
        }
        if (finished.current) return;
        await sleep(i < 8 ? 1500 : 3000);
      }
    })();

    return () => {
      stop = true;
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  // Never show a previous job's state while a new one loads.
  return job && job.id === jobId ? job : null;
}

export async function stopJob(jobId: string): Promise<string> {
  const r = await fetch(`/api/jobs/${jobId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) })
    .then((x) => x.json())
    .catch(() => ({ status: "error" }));
  return (r as { status?: string }).status ?? "error";
}
