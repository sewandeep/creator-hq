"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The floating "Ask" button shown on every page (except the chat itself). */
export function AskFab() {
  const pathname = usePathname();
  if (pathname.startsWith("/ask")) return null;
  return (
    <Link
      href="/ask"
      className="no-print fixed right-4 bottom-20 z-30 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 hover:bg-brand-700 lg:right-6 lg:bottom-6"
    >
      ✨ Ask
    </Link>
  );
}
