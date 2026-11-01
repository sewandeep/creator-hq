"use client";

import { useState, useTransition } from "react";
import { generateRundown } from "@/app/actions/ai";
import { Md } from "./md";

export function RundownCard({ text, when }: { text: string | null; when: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">✨ Weekly rundown</h2>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setError((await generateRundown()).error ?? null))}
          className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
        >
          {pending ? "Writing…" : text ? "Refresh" : "Write one now"}
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
