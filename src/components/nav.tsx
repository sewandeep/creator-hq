"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { MAIN_NAV, MORE_NAV, sectionOf } from "@/lib/nav-items";
import { useAssistant } from "./assistant";

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const section = sectionOf(pathname);
  const { toggle, isOpen } = useAssistant();
  return (
    <nav className="flex flex-1 flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        className={`mb-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${isOpen ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100"}`}
      >
        <span className="text-base">✨</span> Ask AI
        <kbd className={`ml-auto rounded px-1.5 text-[10px] ${isOpen ? "bg-white/20" : "bg-white text-brand-600"}`}>⌘K</kbd>
      </button>
      {MAIN_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${
            section === item.href ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Icon d={item.icon} />
          {item.label}
        </Link>
      ))}
      <div className="mt-6 px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">More</div>
      {MORE_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-lg px-3 py-1.5 text-sm ${pathname.startsWith(item.href) ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-900"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const section = sectionOf(pathname);
  const { toggle, isOpen } = useAssistant();
  const item = (n: (typeof MAIN_NAV)[number]) => (
    <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${section === n.href ? "text-slate-900" : "text-slate-400"}`}>
      <Icon d={n.icon} />
      {n.label}
    </Link>
  );
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {item(MAIN_NAV[0])}
      {item(MAIN_NAV[1])}
      <button type="button" onClick={toggle} className="flex flex-col items-center pb-1.5" aria-label="Ask AI">
        <span className={`-mt-5 grid h-12 w-12 place-items-center rounded-full text-xl shadow-lg ring-4 ring-white ${isOpen ? "bg-slate-900" : "bg-brand-600"}`}>✨</span>
        <span className="mt-0.5 text-[11px] font-medium text-brand-700">Ask AI</span>
      </button>
      {item(MAIN_NAV[2])}
      {item(MAIN_NAV[3])}
    </nav>
  );
}

/** ⌘K / Ctrl+K opens the assistant from anywhere. */
export function Shortcuts() {
  const { toggle } = useAssistant();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  return null;
}
