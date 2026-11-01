import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Stat, StageBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ACTIVE_STAGES, LEAD_STAGES, STAGES, stageInfo } from "@/lib/constants";
import { addDays, fmtDate, fmtDateTime, relativeDay, rupees, todayIST } from "@/lib/format";
import { fyLabel, fyOf, fyRange } from "@/lib/fy";

export default async function Dashboard() {
  const { supabase } = await requireUser();
  const today = todayIST();
  const fy = fyOf(today);
  const { from, to } = fyRange(fy);

  const [deals, followUps, deliverables, dealDeadlines, activity, openInvoices, fyPayments] = await Promise.all([
    supabase.from("deals").select("id, stage, amount, deal_date"),
    supabase
      .from("deals")
      .select("id, title, stage, next_follow_up, brand:brands(name)")
      .not("next_follow_up", "is", null)
      .lte("next_follow_up", addDays(today, 7))
      .not("stage", "in", "(paid,lost)")
      .order("next_follow_up"),
    supabase
      .from("deliverables")
      .select("id, type, quantity, due_date, status, deal:deals(id, title, brand:brands(name))")
      .neq("status", "posted")
      .not("due_date", "is", null)
      .lte("due_date", addDays(today, 14))
      .order("due_date"),
    supabase
      .from("deals")
      .select("id, title, due_date, brand:brands(name)")
      .not("due_date", "is", null)
      .lte("due_date", addDays(today, 14))
      .in("stage", ["confirmed", "in_progress"])
      .order("due_date"),
    supabase
      .from("activities")
      .select("id, kind, body, created_at, deal:deals(id, title)")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("invoices")
      .select("id, invoice_number, due_date, subtotal, status, brand:brands(name), payments(gross_amount)")
      .in("status", ["sent", "partially_paid"])
      .order("due_date"),
    supabase.from("payments").select("gross_amount, tds_amount").gte("received_date", from).lte("received_date", to),
  ]);
  const unpaid = (openInvoices.data ?? []).map((i) => ({
    ...i,
    balance: Math.max(0, Number(i.subtotal) - i.payments.reduce((t, p) => t + Number(p.gross_amount), 0)),
  }));
  const overdueInvoices = unpaid.filter((i) => i.due_date && i.due_date < today);
  const receivedFy = (fyPayments.data ?? []).reduce((t, p) => t + Number(p.gross_amount), 0);
  const tdsFy = (fyPayments.data ?? []).reduce((t, p) => t + Number(p.tds_amount), 0);

  const all = deals.data ?? [];
  const sum = (rows: typeof all) => rows.reduce((t, d) => t + Number(d.amount ?? 0), 0);
  const active = all.filter((d) => ACTIVE_STAGES.includes(d.stage as never));
  const awaiting = all.filter((d) => d.stage === "posted" || d.stage === "invoiced");
  const leads = all.filter((d) => LEAD_STAGES.includes(d.stage as never));
  const paidThisFy = all.filter((d) => d.stage === "paid" && d.deal_date >= from && d.deal_date <= to);

  const deadlines = [
    ...(deliverables.data ?? []).map((d) => ({
      key: `del-${d.id}`,
      date: d.due_date!,
      label: `${d.quantity > 1 ? `${d.quantity}× ` : ""}${d.type}`,
      sub: `${d.deal?.brand?.name ?? ""} · ${d.deal?.title ?? ""}`,
      href: `/deals/${d.deal?.id}`,
    })),
    ...(dealDeadlines.data ?? []).map((d) => ({
      key: `deal-${d.id}`,
      date: d.due_date!,
      label: "Deal deadline",
      sub: `${d.brand?.name ?? ""} · ${d.title}`,
      href: `/deals/${d.id}`,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const counts = STAGES.filter((s) => s.id !== "lost").map((s) => ({
    ...s,
    count: all.filter((d) => d.stage === s.id).length,
  }));
  const maxCount = Math.max(1, ...counts.map((c) => c.count));

  return (
    <>
      <PageHeader title="Home" subtitle={fmtDate(today)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active deals" value={rupees(sum(active))} hint={`${active.length} deals in progress`} href="/deals" />
        <Stat
          label="Waiting for payment"
          value={rupees(unpaid.reduce((t, i) => t + i.balance, 0) + sum(awaiting.filter((d) => d.stage === "posted")))}
          hint={`${unpaid.length} unpaid invoices${overdueInvoices.length ? ` · ${overdueInvoices.length} overdue` : ""}`}
          href="/invoices?status=unpaid"
        />
        <Stat
          label={`Received ${fyLabel(fy)}`}
          value={rupees(receivedFy || sum(paidThisFy))}
          hint={receivedFy ? `incl. ${rupees(tdsFy)} TDS` : `${paidThisFy.length} paid deals`}
          href="/payments"
        />
        <Stat label="Open leads" value={leads.length} hint="Lead · contacted · negotiating" href="/leads" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {overdueInvoices.length > 0 && (
          <Card title="Overdue invoices" className="lg:col-span-2" action={<Link href="/invoices?status=overdue" className="link text-xs">All →</Link>}>
            <ul className="divide-y divide-slate-100">
              {overdueInvoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <Link href={`/invoices/${i.id}`} className="min-w-0 hover:underline">
                    <div className="truncate text-sm font-medium">{i.brand?.name} · {i.invoice_number}</div>
                    <div className="text-xs text-rose-600">{rupees(i.balance)} · {relativeDay(i.due_date!, today)}</div>
                  </Link>
                  <Link href={`/email/compose?invoice=${i.id}&template=${encodeURIComponent("Payment reminder")}`} className="btn-secondary px-3 py-1 text-xs">
                    Send reminder
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Follow-ups due" action={<Link href="/leads" className="link text-xs">All leads →</Link>}>
          {followUps.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {followUps.data.map((d) => {
                const overdue = d.next_follow_up! < today;
                return (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{d.brand?.name}</div>
                        <div className="truncate text-xs text-slate-500">{d.title}</div>
                      </div>
                      <Badge tone={overdue ? "red" : d.next_follow_up === today ? "amber" : "slate"}>
                        {relativeDay(d.next_follow_up!, today)}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No follow-ups due this week. 🎉</Empty>
          )}
        </Card>

        <Card title="Deadlines (next 14 days)" action={<Link href="/calendar" className="link text-xs">Calendar →</Link>}>
          {deadlines.length ? (
            <ul className="divide-y divide-slate-100">
              {deadlines.map((d) => (
                <li key={d.key}>
                  <Link href={d.href} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{d.label}</div>
                      <div className="truncate text-xs text-slate-500">{d.sub}</div>
                    </div>
                    <Badge tone={d.date < today ? "red" : d.date === today ? "amber" : "slate"}>{relativeDay(d.date, today)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing due in the next two weeks.</Empty>
          )}
        </Card>

        <Card title="Pipeline">
          <ul className="space-y-2">
            {counts.map((c) => (
              <li key={c.id}>
                <Link href={`/deals?view=list&stage=${c.id}`} className="flex items-center gap-3 text-sm hover:opacity-80">
                  <span className="w-32 shrink-0 text-slate-600">{c.label}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(c.count / maxCount) * 100}%` }} />
                  </span>
                  <span className="w-6 text-right font-medium tabular-nums">{c.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Recent activity">
          {activity.data?.length ? (
            <ul className="space-y-3">
              {activity.data.map((a) => (
                <li key={a.id} className="text-sm">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{fmtDateTime(a.created_at)}</span>
                    {a.kind === "stage_change" && <StageBadge stage={a.body.split(" → ")[1] ?? "lead"} />}
                  </div>
                  <div className="truncate">
                    {a.deal ? (
                      <Link href={`/deals/${a.deal.id}`} className="font-medium hover:underline">
                        {a.deal.title}
                      </Link>
                    ) : null}{" "}
                    <span className="text-slate-600">{a.kind === "stage_change"
                        ? `moved ${a.body.split(" → ").map((x) => stageInfo(x).label).join(" → ")}`
                        : a.body}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty action={<Link href="/import" className="btn-secondary">Import past work</Link>}>
              Nothing yet. Add a deal or import your past collaborations.
            </Empty>
          )}
        </Card>
      </div>
    </>
  );
}
