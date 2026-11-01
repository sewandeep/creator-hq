import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, PageHeader, StageBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { LEAD_STAGES } from "@/lib/constants";
import { daysBetween, fmtDate, relativeDay, rupees, todayIST } from "@/lib/format";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
  const { supabase } = await requireUser();
  const today = todayIST();
  const { data, error } = await supabase
    .from("deals")
    .select("id, title, stage, amount, next_follow_up, stage_changed_at, created_at, brand:brands(id, name), contact:contacts(name, email)")
    .in("stage", LEAD_STAGES)
    .order("next_follow_up", { ascending: true, nullsFirst: false });
  if (error) throw error;
  const leads = data ?? [];

  const groups = [
    { title: "Overdue", tone: "red" as const, items: leads.filter((l) => l.next_follow_up && l.next_follow_up < today) },
    { title: "Today", tone: "amber" as const, items: leads.filter((l) => l.next_follow_up === today) },
    { title: "Coming up", tone: "slate" as const, items: leads.filter((l) => l.next_follow_up && l.next_follow_up > today) },
    { title: "No follow-up set", tone: "slate" as const, items: leads.filter((l) => !l.next_follow_up) },
  ];

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Brands you're chasing or talking to. Log every follow-up so nothing goes cold."
        actions={<Link href="/deals/new?stage=lead" className="btn-primary">+ New lead</Link>}
      />
      {leads.length === 0 ? (
        <Empty action={<Link href="/deals/new?stage=lead" className="btn-primary">Add a lead</Link>}>No open leads.</Empty>
      ) : (
        <div className="space-y-6">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.title}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  {g.title} <Badge tone={g.tone}>{g.items.length}</Badge>
                </h2>
                <ul className="card divide-y divide-slate-100">
                  {g.items.map((l) => {
                    const idle = daysBetween(l.stage_changed_at.slice(0, 10), today);
                    return (
                      <li key={l.id}>
                        <Link href={`/deals/${l.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{l.brand?.name}</span>
                              <StageBadge stage={l.stage} />
                            </div>
                            <div className="truncate text-sm text-slate-500">
                              {l.title}
                              {l.contact ? ` · ${l.contact.name}` : ""}
                              {l.amount ? ` · ${rupees(l.amount)}` : ""}
                            </div>
                            <div className="text-xs text-slate-400">In this stage for {idle} day{idle === 1 ? "" : "s"}</div>
                          </div>
                          {l.next_follow_up && (
                            <div className="text-right text-sm">
                              <div className={g.tone === "red" ? "font-medium text-rose-600" : "text-slate-700"}>{relativeDay(l.next_follow_up, today)}</div>
                              <div className="text-xs text-slate-400">{fmtDate(l.next_follow_up, true)}</div>
                            </div>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
