"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { applySuggestion } from "@/app/actions/suggestions";
import type { Suggestion, SuggestionAction } from "@/lib/suggestions";
import { useAssistant } from "./assistant";
import { toast } from "./toast";

/** One suggestion with its one-tap fixes. Disappears the moment you tap. */
export function SuggestionCard({ s, compact = false }: { s: Suggestion; compact?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [tds, setTds] = useState(10);
  const [brand, setBrand] = useState(s.actions.find((a) => a.kind === "create_deal")?.kind === "create_deal" ? (s.actions.find((a) => a.kind === "create_deal") as Extract<SuggestionAction, { kind: "create_deal" }>).brand : "");
  const [, start] = useTransition();
  const { open } = useAssistant();
  if (hidden) return null;

  function run(a: SuggestionAction) {
    if (a.kind === "ask") return open(a.message);
    setHidden(true);
    start(async () => {
      const r = await applySuggestion(s.key, a, { tdsRate: tds, brand }).catch(() => ({ ok: false, message: "Couldn't reach the app — try again.", groupId: undefined }));
      if (!r.ok) {
        setHidden(false);
        toast(r.message, { tone: "error" });
      } else toast(r.message, { undoGroup: "groupId" in r ? r.groupId : undefined });
    });
  }

  const primary = (a: SuggestionAction, i: number) => i === 0 && a.kind !== "dismiss";
  return (
    <div className={`rounded-2xl bg-white ring-1 ring-slate-200 ${compact ? "px-4 py-3" : "p-4 shadow-sm"}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none">{s.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] leading-snug font-medium">{s.title}</div>
          <div className="mt-0.5 text-xs text-slate-500">{s.detail}</div>
          {s.askTds && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5">
                Brand
                <input value={brand} onChange={(e) => setBrand(e.target.value)} className="input w-40 py-1 text-xs" />
              </label>
              <label className="flex items-center gap-1.5">
                TDS cut
                <select value={tds} onChange={(e) => setTds(Number(e.target.value))} className="input w-auto py-1 text-xs">
                  <option value={10}>10% (194J)</option>
                  <option value={2}>2% (194C)</option>
                  <option value={0}>None</option>
                </select>
              </label>
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {s.actions.map((a, i) =>
              a.kind === "link" ? (
                <Link key={i} href={a.href} className="btn-secondary px-3 py-1.5 text-xs">{a.label}</Link>
              ) : (
                <button key={i} type="button" onClick={() => run(a)} className={`${primary(a, i) ? "btn-primary" : a.kind === "dismiss" || a.kind === "snooze" ? "btn-ghost text-slate-500" : "btn-secondary"} px-3 py-1.5 text-xs`}>
                  {a.label}
                </button>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
