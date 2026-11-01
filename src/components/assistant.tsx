"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Chat } from "@/app/(app)/ask/chat";
import { contextFor, suggestionsFor } from "@/lib/ai/suggestions";

type Assistant = { open: (message?: string) => void; close: () => void; toggle: () => void; isOpen: boolean };
const Ctx = createContext<Assistant>({ open: () => {}, close: () => {}, toggle: () => {}, isOpen: false });
export const useAssistant = () => useContext(Ctx);

/**
 * The AI panel available on every page: a side panel on bigger screens and a
 * slide-up sheet on phones. One conversation everywhere; it knows the page.
 */
export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [queued, setQueued] = useState<string | null>(null);

  // Remember whether the panel was open (desktop) between visits.
  useEffect(() => {
    const t = setTimeout(() => {
      if (localStorage.getItem("ai-panel") === "open" && window.matchMedia("(min-width: 1024px)").matches) {
        setOpen(true);
        setEverOpened(true);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const open = useCallback((message?: string) => {
    setOpen(true);
    setEverOpened(true);
    localStorage.setItem("ai-panel", "open");
    if (message?.trim()) setQueued(message.trim());
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    localStorage.setItem("ai-panel", "closed");
  }, []);
  const value = useMemo(() => ({ open, close, toggle: () => (isOpen ? close() : open()), isOpen }), [open, close, isOpen]);

  return (
    <Ctx value={value}>
      <div className="flex min-h-dvh">
        <div className="min-w-0 flex-1">{children}</div>
        {everOpened && <Panel isOpen={isOpen} close={close} queued={queued} clearQueued={() => setQueued(null)} />}
      </div>
    </Ctx>
  );
}

function Panel({ isOpen, close, queued, clearQueued }: { isOpen: boolean; close: () => void; queued: string | null; clearQueued: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const context = contextFor(pathname, new URLSearchParams(search.toString()));
  const what = context?.type === "deal" ? "this deal" : context?.type === "brand" ? "this brand" : context?.type === "transaction" ? "this payment" : context?.type === "invoice" ? "this invoice" : null;

  return (
    <>
      {/* Phone: dim the page behind the sheet */}
      <div onClick={close} className={`fixed inset-0 z-40 bg-slate-900/30 transition-opacity lg:hidden ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside
        aria-label="AI assistant"
        className={`no-print fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] flex-col rounded-t-3xl bg-slate-50 shadow-2xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-20 lg:h-dvh lg:w-[400px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-slate-200 lg:shadow-none ${
          isOpen ? "translate-y-0" : "translate-y-full lg:hidden"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 lg:rounded-none">
          <div className="min-w-0">
            <div className="text-sm font-semibold">✨ Assistant</div>
            <div className="truncate text-xs text-slate-500">{what ? `Knows you're looking at ${what}` : "Ask, add or drop a file"}</div>
          </div>
          <button type="button" onClick={close} className="btn-ghost px-2" aria-label="Close assistant">✕</button>
        </div>
        <div className="min-h-0 flex-1">
          <Chat variant="panel" context={context} suggestions={suggestionsFor(context)} queued={queued} onQueuedTaken={clearQueued} />
        </div>
      </aside>
    </>
  );
}

export function AskButton({ className = "", label = "✨ Ask AI", message }: { className?: string; label?: string; message?: string }) {
  const { open } = useAssistant();
  return (
    <button type="button" onClick={() => open(message)} className={className}>
      {label}
    </button>
  );
}
