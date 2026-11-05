"use client";

import { useState, useTransition } from "react";
import { testAssistant, testGroq } from "@/app/actions/ai";

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

export function GroqTest() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);
  return (
    <div className="space-y-2">
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await testGroq()))} className="btn-secondary px-3 py-1.5 text-xs">
        {pending ? "Testing… (up to a minute)" : "Test the fast AI"}
      </button>
      {result && (
        <ul className={`space-y-0.5 text-sm ${result.ok ? "text-emerald-800" : "text-rose-700"}`}>
          {result.lines.map((l, i) => (
            <li key={i} className="break-words">{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
