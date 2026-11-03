"use client";

import { useEffect, useState } from "react";
import { undoChanges } from "@/app/actions/activity";

// Small messages at the bottom of the screen: "Saved · Undo", or what went wrong.
// Call toast() from anywhere in the browser.

type Toast = { id: number; text: string; tone: "ok" | "error" | "info"; undoGroup?: string };
const EVENT = "app-toast";
let next = 1;

export function toast(text: string, opts: { tone?: Toast["tone"]; undoGroup?: string } = {}) {
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { id: next++, text, tone: opts.tone ?? "ok", undoGroup: opts.undoGroup } }));
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setItems((list) => [...list.slice(-2), t]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.undoGroup ? 7000 : t.tone === "error" ? 9000 : 3500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-2.5 text-sm shadow-lg ${t.tone === "error" ? "bg-rose-600 text-white" : "bg-slate-900 text-white"}`}
        >
          <span className="min-w-0">{t.text}</span>
          {t.undoGroup && (
            <button
              type="button"
              onClick={async () => {
                const g = t.undoGroup!;
                setItems((list) => list.filter((x) => x.id !== t.id));
                const r = await undoChanges(g);
                toast(r.message, { tone: r.ok ? "info" : "error" });
              }}
              className="shrink-0 font-semibold text-brand-200 hover:text-white"
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
