"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav-items";



// The five that fit on the phone's bottom bar.
const MOBILE = ["/", "/deals", "/leads", "/invoices", "/money"];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // "Overview" (/money) shouldn't light up on the other /money pages that have their own menu item.
  if (href === "/money") return pathname === "/money" || ["/money/add", "/money/statements"].some((p) => pathname.startsWith(p));
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <nav className="flex flex-col gap-0.5 overflow-y-auto">
      {groups.map((g) => (
        <div key={g} className="mb-1">
          {g && <div className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{g}</div>}
          {NAV.filter((n) => n.group === g).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium ${
                isActive(pathname, item.href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon d={item.icon} />
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {NAV.filter((n) => MOBILE.includes(n.href)).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
            isActive(pathname, item.href) ? "text-brand-600" : "text-slate-500"
          }`}
        >
          <Icon d={item.icon} />
          {item.href === "/money" ? "Money" : item.label}
        </Link>
      ))}
    </nav>
  );
}
