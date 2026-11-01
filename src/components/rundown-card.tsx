"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { generateRundown } from "@/app/actions/ai";
import { Md } from "./md";

export function RundownCard({ text, when, createdAt }: { text: string | null; when: string | null; createdAt?: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [waitingSince, setWaitingSince] = useState<string | null>(null);
  const router = useRouter();
  const writing = Boolean(waitingSince && (!createdAt || createdAt < waitingSince));

  // While the rundown is being written in the background, refresh every few seconds.
  useEffect(() => {
    if (!writing) return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > 4 * 60_000) {
        clearInterval(t);
        setWaitingSince(null);
        setError("Still not ready — reload the page in a minute.");
      } else router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [writing, router]);
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">✨ Weekly rundown</h2>
        <button
          type="button"
          disabled={pending || writing}
          onClick={() =>
            start(async () => {
              const r = await generateRundown();
              setError(r.error ?? null);
              if (r.since) setWaitingSince(r.since);
            })
          }
          className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
        >
          {pending || writing ? "Writing… (about a minute)" : text ? "Refresh" : "Write one now"}
        </button>
      </div>
      <div className="p-4">
        {error && <p className="mb-2 text-sm text-rose-700">{error}</p>}
        {text ? (
          <>
            <Md text={text} />
            {when && <p className="mt-2 text-xs text-slate-400">{when}</p>}
          </>
        ) : (
          <p className="text-sm text-slate-500">A short AI summary of your week — deals, money, unpaid invoices and what&apos;s next. It also arrives on Telegram every Sunday.</p>
        )}
      </div>
    </section>
  );
}
