"use client";

import { useState, useTransition } from "react";
import { testAssistant } from "@/app/actions/ai";

export function AiTest() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await testAssistant()))} className="btn-secondary px-3 py-1.5 text-xs">
        {pending ? "Testing…" : "Test the AI assistant"}
      </button>
      {result && <span className={`text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</span>}
    </div>
  );
}
