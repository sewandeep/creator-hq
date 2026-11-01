import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { addDays, fmtDate, todayIST } from "@/lib/format";

export const metadata: Metadata = { title: "Calendar" };

type Event = { date: string; label: string; sub: string; href: string; kind: "due" | "posted" | "deadline" | "followup" };

const KIND_STYLE: Record<Event["kind"], { chip: string; dot: string; name: string }> = {
  due: { chip: "bg-amber-100 text-amber-900", dot: "bg-amber-500", name: "Content due" },
  deadline: { chip: "bg-violet-100 text-violet-900", dot: "bg-violet-500", name: "Deal deadline" },
  posted: { chip: "bg-teal-100 text-teal-900", dot: "bg-teal-500", name: "Posted" },
  followup: { chip: "bg-sky-100 text-sky-900", dot: "bg-sky-500", name: "Follow-up" },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const today = todayIST();
  const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);

  const first = `${ym}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const gridStart = addDays(first, -offset);
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
  const gridEnd = addDays(gridStart, cells - 1);

  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));

  const { supabase } = await requireUser();
  const [due, posted, deadlines, followUps] = await Promise.all([
    supabase.from("deliverables").select("id, type, quantity, due_date, deal:deals(id, title, brand:brands(name))").neq("status", "posted").gte("due_date", gridStart).lte("due_date", gridEnd),
    supabase.from("deliverables").select("id, type, quantity, posted_date, deal:deals(id, title, brand:brands(name))").gte("posted_date", gridStart).lte("posted_date", gridEnd),
    supabase.from("deals").select("id, title, due_date, brand:brands(name)").in("stage", ["confirmed", "in_progress"]).gte("due_date", gridStart).lte("due_date", gridEnd),
    supabase.from("deals").select("id, title, next_follow_up, brand:brands(name)").not("stage", "in", "(paid,lost)").gte("next_follow_up", gridStart).lte("next_follow_up", gridEnd),
  ]);

  const qty = (n: number) => (n > 1 ? `${n}× ` : "");
  const events: Event[] = [
    ...(due.data ?? []).map((d) => ({ date: d.due_date!, kind: "due" as const, label: `${qty(d.quantity)}${d.type}`, sub: d.deal?.brand?.name ?? "", href: `/deals/${d.deal?.id}` })),
    ...(posted.data ?? []).map((d) => ({ date: d.posted_date!, kind: "posted" as const, label: `${qty(d.quantity)}${d.type}`, sub: d.deal?.brand?.name ?? "", href: `/deals/${d.deal?.id}` })),
    ...(deadlines.data ?? []).map((d) => ({ date: d.due_date!, kind: "deadline" as const, label: d.title, sub: d.brand?.name ?? "", href: `/deals/${d.id}` })),
    ...(followUps.data ?? []).map((d) => ({ date: d.next_follow_up!, kind: "followup" as const, label: `Follow up: ${d.brand?.name ?? ""}`, sub: d.title, href: `/deals/${d.id}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const byDate = new Map<string, Event[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const monthEvents = events.filter((e) => e.date.startsWith(ym));

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={monthName}
        actions={
          <div className="flex gap-1">
            <Link href={`/calendar?month=${prev}`} className="btn-secondary" aria-label="Previous month">←</Link>
            <Link href="/calendar" className="btn-secondary">Today</Link>
            <Link href={`/calendar?month=${next}`} className="btn-secondary" aria-label="Next month">→</Link>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
        {Object.entries(KIND_STYLE).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.name}
          </span>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-500">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: cells }, (_, i) => {
            const date = addDays(gridStart, i);
            const inMonth = date.startsWith(ym);
            const list = byDate.get(date) ?? [];
            return (
              <div key={date} className={`min-h-16 border-r border-b border-slate-100 p-1 sm:min-h-28 sm:p-1.5 ${inMonth ? "" : "bg-slate-50/70 text-slate-400"}`}>
                <div className={`mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-xs ${date === today ? "bg-brand-600 font-semibold text-white" : ""}`}>
                  {Number(date.slice(8))}
                </div>
                {/* Phone: dots. Bigger screens: chips. */}
                <div className="flex flex-wrap gap-0.5 sm:hidden">
                  {list.map((e, j) => (
                    <span key={j} className={`h-1.5 w-1.5 rounded-full ${KIND_STYLE[e.kind].dot}`} />
                  ))}
                </div>
                <div className="hidden space-y-0.5 sm:block">
                  {list.slice(0, 4).map((e, j) => (
                    <Link key={j} href={e.href} title={`${e.label} — ${e.sub}`} className={`block truncate rounded px-1.5 py-0.5 text-[11px] leading-tight ${KIND_STYLE[e.kind].chip}`}>
                      {e.label}
                    </Link>
                  ))}
                  {list.length > 4 && <div className="px-1 text-[11px] text-slate-500">+{list.length - 4} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <h2 className="mt-8 mb-2 text-sm font-semibold text-slate-700">This month</h2>
      {monthEvents.length ? (
        <ul className="card divide-y divide-slate-100">
          {monthEvents.map((e, i) => (
            <li key={i}>
              <Link href={e.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_STYLE[e.kind].dot}`} />
                <span className="w-20 shrink-0 text-sm text-slate-500">{fmtDate(e.date, true)}</span>
                <span className="min-w-0 truncate text-sm">
                  <span className="font-medium">{e.label}</span>
                  <span className="text-slate-500"> · {e.sub}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nothing scheduled this month.</p>
      )}
    </>
  );
}
