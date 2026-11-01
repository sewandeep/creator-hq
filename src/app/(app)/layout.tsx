import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { AssistantProvider } from "@/components/assistant";
import { BottomNav, Shortcuts, SideNav } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { MORE_NAV } from "@/lib/nav-items";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireUser();

  return (
    <Suspense>
      <AssistantProvider>
        <Shortcuts />
        <div className="min-h-dvh lg:flex">
          {/* Desktop sidebar */}
          <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 lg:flex">
            <Link href="/" className="mb-6 flex items-center gap-2 px-3 text-base font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-xs text-white">HQ</span>
              Creator HQ
            </Link>
            <SideNav />
            <div className="mt-4 border-t border-slate-100 px-3 pt-4 text-xs text-slate-500">
              <div className="truncate" title={email}>{email}</div>
              <form action={logout}>
                <button className="mt-1 text-slate-600 hover:text-slate-900">Log out</button>
              </form>
            </div>
          </aside>

          {/* Phone top bar */}
          <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-[10px] text-white">HQ</span>
              Creator HQ
            </Link>
            <details className="relative">
              <summary className="btn-ghost cursor-pointer list-none px-2 py-1.5" aria-label="More">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </summary>
              <div className="absolute right-0 mt-2 max-h-[75dvh] w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                {MORE_NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                    {n.label}
                  </Link>
                ))}
                <form action={logout} className="border-t border-slate-100 pt-1">
                  <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100">Log out</button>
                </form>
              </div>
            </details>
          </header>

          <main className="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:py-8">{children}</main>
          <BottomNav />
        </div>
      </AssistantProvider>
    </Suspense>
  );
}
