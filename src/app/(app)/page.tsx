import Link from "next/link";
import { followedUp, invoiceAndSend, snoozeFollowUp } from "@/app/actions/quick";
import { AskBox } from "@/components/ask-box";
import { RundownCard } from "@/components/rundown-card";
import { requireUser } from "@/lib/auth";
import { loadTxns, monthLabel, monthRange, shiftMonth, summarize } from "@/lib/finance/report";
import { addDays, daysBetween, fmtDate, fmtDateTime, relativeDay, rupees, todayIST } from "@/lib/format";

type Item = {
  key: string;
  icon: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "red" | "amber" | "slate";
  actions: React.ReactNode;
};

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Today() {
  const { supabase, userId } = await requireUser();
  const today = todayIST();
  const ym = today.slice(0, 7);
  const lastMonth = shiftMonth(ym, -1);
  const lm = monthRange(lastMonth);

  const [profile, followUps, due, toInvoice, overdue, review, accounts, statements, payments, unpaid, openDeals, upcomingDel, upcomingFollow, rundown, monthTxns] = await Promise.all([
    supabase.from("profile").select("display_name, legal_name").maybeSingle(),
    supabase.from("deals").select("id, title, next_follow_up, brand:brands(name)").lte("next_follow_up", today).not("stage", "in", "(paid,lost)").order("next_follow_up").limit(8),
    supabase.from("deliverables").select("id, type, quantity, due_date, deal:deals(id, title, brand:brands(name))").neq("status", "posted").lte("due_date", addDays(today, 3)).order("due_date").limit(8),
    supabase.from("deals").select("id, title, amount, brand:brands(name), invoices(id, status)").eq("stage", "posted").gt("amount", 0),
    supabase.from("invoices").select("id, invoice_number, due_date, subtotal, brand:brands(name), payments(gross_amount)").in("status", ["sent", "partially_paid"]).lt("due_date", today),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("needs_review", true),
    supabase.from("bank_accounts").select("id, name").eq("is_archived", false),
    supabase.from("statements").select("account_id, period_to, created_at").eq("status", "done").gte("period_to", lm.from),
    supabase.from("payments").select("gross_amount").gte("received_date", `${ym}-01`),
    supabase.from("invoices").select("subtotal, payments(gross_amount)").in("status", ["sent", "partially_paid", "draft"]),
    supabase.from("deals").select("amount").in("stage", ["confirmed", "in_progress", "posted", "invoiced"]),
    supabase.from("deliverables").select("id, type, quantity, due_date, deal:deals(id, brand:brands(name))").neq("status", "posted").gt("due_date", addDays(today, 3)).lte("due_date", addDays(today, 14)).order("due_date").limit(6),
    supabase.from("deals").select("id, title, next_follow_up, brand:brands(name)").gt("next_follow_up", today).lte("next_follow_up", addDays(today, 7)).not("stage", "in", "(paid,lost)").order("next_follow_up").limit(6),
    supabase.from("ai_messages").select("content, created_at").eq("channel", "rundown").eq("role", "assistant").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    loadTxns(supabase, `${ym}-01`, today, userId),
  ]);

  const name = (profile.data?.display_name || profile.data?.legal_name || "").split(" ")[0];
  const spent = summarize(monthTxns).spent;
  const earned = (payments.data ?? []).reduce((s, p) => s + Number(p.gross_amount), 0);
  const waiting = (unpaid.data ?? []).reduce((s, i) => s + Math.max(0, Number(i.subtotal) - i.payments.reduce((t, p) => t + Number(p.gross_amount), 0)), 0);
  const pipeline = (openDeals.data ?? []).reduce((s, d) => s + Number(d.amount ?? 0), 0);

  // ---- What needs you ----
  const items: Item[] = [];
  const missing = (accounts.data ?? []).filter(
    (a) => !(statements.data ?? []).some((s) => s.account_id === a.id && s.period_to && (s.period_to >= addDays(lm.to, -3) || s.created_at.slice(0, 10) > lm.to)),
  );
  if (missing.length && Number(today.slice(8)) >= 2) {
    items.push({
      key: "stmt",
      icon: "📄",
      title: `Upload ${monthLabel(lastMonth)} statement${missing.length > 1 ? "s" : ""}`,
      sub: `${missing.map((a) => a.name).join(" and ")} — or just forward the PDF to the Telegram bot`,
      tone: "amber",
      actions: <Link href="/money/upload" className="btn-primary px-3 py-1.5 text-xs">Upload</Link>,
    });
  }
  if (review.count) {
    items.push({
      key: "review",
      icon: "🧾",
      title: `${review.count} transaction${review.count === 1 ? "" : "s"} to sort`,
      sub: "Tell the app what they were — one tap each",
      actions: <Link href="/money/review" className="btn-primary px-3 py-1.5 text-xs">Sort now</Link>,
    });
  }
  for (const f of followUps.data ?? []) {
    items.push({
      key: `f-${f.id}`,
      icon: "📞",
      title: <>Follow up with <b>{f.brand?.name}</b></>,
      sub: `${f.title} · ${relativeDay(f.next_follow_up!, today)}`,
      tone: f.next_follow_up! < today ? "red" : "amber",
      actions: (
        <>
          <form action={followedUp.bind(null, f.id, 3)}><button className="btn-primary px-3 py-1.5 text-xs" title="Log it and remind me again in 3 days">Done ✓</button></form>
          <form action={snoozeFollowUp.bind(null, f.id, 2)}><button className="btn-secondary px-3 py-1.5 text-xs">Later</button></form>
          <Link href={`/deals?deal=${f.id}`} className="btn-ghost px-2 py-1.5 text-xs">Open</Link>
        </>
      ),
    });
  }
  for (const d of due.data ?? []) {
    items.push({
      key: `d-${d.id}`,
      icon: "🎬",
      title: <>{d.quantity > 1 ? `${d.quantity}× ` : ""}{d.type} for <b>{d.deal?.brand?.name}</b></>,
      sub: `Due ${relativeDay(d.due_date!, today).toLowerCase()}`,
      tone: d.due_date! < today ? "red" : d.due_date === today ? "amber" : "slate",
      actions: <Link href={`/deals?deal=${d.deal?.id}`} className="btn-secondary px-3 py-1.5 text-xs">Mark posted</Link>,
    });
  }
  for (const d of (toInvoice.data ?? []).filter((x) => !x.invoices.some((i) => i.status !== "cancelled"))) {
    items.push({
      key: `i-${d.id}`,
      icon: "🧾",
      title: <>Send the invoice to <b>{d.brand?.name}</b></>,
      sub: `${d.title} · ${rupees(d.amount)} — content is posted`,
      actions: <form action={invoiceAndSend.bind(null, d.id)}><button className="btn-primary px-3 py-1.5 text-xs">Create & send</button></form>,
    });
  }
  for (const i of overdue.data ?? []) {
    const bal = Number(i.subtotal) - i.payments.reduce((t, p) => t + Number(p.gross_amount), 0);
    items.push({
      key: `o-${i.id}`,
      icon: "💸",
      title: <><b>{i.brand?.name}</b> hasn&apos;t paid {rupees(bal)}</>,
      sub: `${i.invoice_number} · ${daysBetween(i.due_date!, today)} days late`,
      tone: "red",
      actions: (
        <>
          <Link href={`/email/compose?invoice=${i.id}&template=${encodeURIComponent("Payment reminder")}`} className="btn-primary px-3 py-1.5 text-xs">Send reminder</Link>
          <Link href={`/invoices/${i.id}`} className="btn-ghost px-2 py-1.5 text-xs">Got paid?</Link>
        </>
      ),
    });
  }

  const upcoming = [
    ...(upcomingDel.data ?? []).map((d) => ({ key: `ud-${d.id}`, date: d.due_date!, text: `${d.quantity > 1 ? `${d.quantity}× ` : ""}${d.type} for ${d.deal?.brand?.name ?? ""}`, href: `/deals?deal=${d.deal?.id}` })),
    ...(upcomingFollow.data ?? []).map((f) => ({ key: `uf-${f.id}`, date: f.next_follow_up!, text: `Follow up with ${f.brand?.name ?? ""}`, href: `/deals?deal=${f.id}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const toneDot = { red: "bg-rose-500", amber: "bg-amber-400", slate: "bg-slate-300" };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm text-slate-500">{fmtDate(today)}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}{name ? `, ${name}` : ""}</h1>
      </div>

      <AskBox />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={`Earned in ${monthLabel(ym, true).split(" ")[0]}`} value={rupees(earned)} href="/reports" />
        <Tile label="Waiting for payment" value={rupees(waiting)} href="/invoices?status=unpaid" />
        <Tile label="Deals in progress" value={rupees(pipeline)} sub={`${openDeals.data?.length ?? 0} deals`} href="/deals" />
        <Tile label={`Spent in ${monthLabel(ym, true).split(" ")[0]}`} value={rupees(spent)} href="/money" />
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="font-semibold">Needs you</h2>
          <span className="text-xs text-slate-500">{items.length ? `${items.length} thing${items.length === 1 ? "" : "s"}` : ""}</span>
        </div>
        {items.length ? (
          <ul className="divide-y divide-slate-100">
            {items.map((it) => (
              <li key={it.key} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="relative text-xl leading-none">
                  {it.icon}
                  {it.tone && <span className={`absolute -top-0.5 -right-1 h-2 w-2 rounded-full ${toneDot[it.tone]}`} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] leading-snug">{it.title}</div>
                  {it.sub && <div className="truncate text-xs text-slate-500">{it.sub}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">{it.actions}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center">
            <div className="text-3xl">✨</div>
            <p className="mt-2 font-medium">You&apos;re all caught up.</p>
            <p className="text-sm text-slate-500">Log anything with the box above or on Telegram.</p>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-5 py-3.5 font-semibold">Coming up</div>
          {upcoming.length ? (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((u) => (
                <li key={u.key}>
                  <Link href={u.href} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                    <span className="truncate">{u.text}</span>
                    <span className="shrink-0 text-xs text-slate-500">{fmtDate(u.date, true)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-500">Nothing in the next two weeks.</p>
          )}
        </section>
        <RundownCard text={rundown.data?.content ?? null} when={rundown.data ? `Written ${fmtDateTime(rundown.data.created_at)}` : null} createdAt={rundown.data?.created_at ?? null} />
      </div>
    </div>
  );
}

function Tile({ label, value, sub, href }: { label: string; value: string; sub?: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </Link>
  );
}
