"use client";

import Link from "next/link";

// Shown instead of a blank "server error" when a page fails to load.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div className="text-4xl">😕</div>
      <h1 className="mt-3 text-xl font-semibold">This page couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-slate-600">
        The most common reason is that the database is missing an update after a new version of the app. The setup check will tell you exactly what to fix.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Link href="/setup" className="btn-primary">Run setup check</Link>
        <button type="button" onClick={reset} className="btn-secondary">Try again</button>
      </div>
      {error.digest && <p className="mt-6 text-xs text-slate-400">Error reference: {error.digest}</p>}
    </div>
  );
}
