import type { Metadata } from "next";
import { Tap } from "@/components/tap";
import Link from "next/link";
import { Suspense } from "react";
import { invoiceAndSend, followedUp } from "@/app/actions/quick";
import { markInvoicePaid } from "@/app/actions/work";
import { moveDealToStage } from "@/app/actions/deals";
import { requireUser } from "@/lib/auth";
import { relativeDay, rupees, todayIST } from "@/lib/format";
import { isOverdue } from "@/lib/money";
import { DealPanel } from "./deal-panel";
import { NewDeal } from "./work-parts";

export const metadata: Metadata = { title: "Work" };

type Search = { deal?: string; show?: string; q?: string };

const GROUPS = [
  { id: "talking", label: "Talking", hint: "Leads & negotiations", stages: ["lead", "contacted", "negotiating"] },
  { id: "doing", label: "Doing", hint: "Confirmed — make the content", stages: ["confirmed", "in_progress"] },
  { id: "money", label: "Waiting for money", hint: "Posted & invoiced", stages: ["posted", "invoiced"] },
] as const;

export default async function WorkPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const show = ["active", "done", "lost", "all"].includes(sp.show ?? "") ? sp.show! : "active";
  const { supabase } = await requireUser();
  const today = todayIST();

  let q = supabase
    .from("deals")
    .select("id, title, stage, amount, is_barter, due_date, next_follow_up, deal_date, brand:brands!inner(name), invoices(id, status, subtotal, due_date, payments(gross_amount)), deliverables(status)")
    .order("deal_date", { ascending: false });
  if (show === "active") q = q.not("stage", "in", "(paid,lost)");
  if (show === "done") q = q.eq("stage", "paid").limit(100);
  if (show === "lost") q = q.eq("stage", "lost").limit(100);
  const [{ data }, { data: brandRows }] = await Promise.all([q, supabase.from("brands").select("name").order("name")]);
  const needle = sp.q?.trim().toLowerCase() ?? "";
  const deals = (data ?? []).filter((d) => !needle || d.title.toLowerCase().includes(needle) || d.brand.name.toLowerCase().includes(needle));

  const selected = sp.deal && /^[0-9a-f-]{36}$/.test(sp.deal) ? sp.deal : null;
  const keep = (extra: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    const all = { show: show === "active" ? undefined : show, q: sp.q, ...extra };
    Object.entries(all).forEach(([k, v]) => v && s.set(k, v));
    const str = s.toString();
    return `/deals${str ? `?${str}` : ""}`;
  };
  const closeHref = keep({ deal: undefined });

  const card = (d: (typeof deals)[number], compact = false) => {
    const inv = d.invoices.find((i) => i.status !== "cancelled");
    const balance = inv ? Number(inv.subtotal) - inv.payments.reduce((s, p) => s + Number(p.gross_amount), 0) : 0;
    const followDue = d.next_follow_up && d.next_follow_up <= today && !["paid", "lost"].includes(d.stage);
    const late = d.due_date && d.due_date < today && ["confirmed", "in_progress"].includes(d.stage);
    const posted = d.deliverables.filter((x) => x.status === "posted").length;
    const active = selected === d.id;

    let action: React.ReactNode = null;
    if (!compact) {
      if (followDue) action = <Tap action={followedUp.bind(null, d.id, 3)} className="btn-secondary w-full px-2 py-1 text-xs" hideRow saved="Follow-up logged">Followed up ✓</Tap>;
      else if (["lead", "contacted", "negotiating"].includes(d.stage)) action = <Tap action={moveDealToStage.bind(null, d.id, "confirmed")} className="btn-secondary w-full px-2 py-1 text-xs" done="✓" saved="Moved">They said yes →</Tap>;
      else if (d.stage === "posted" && !inv && d.amount) action = <Tap action={invoiceAndSend.bind(null, d.id)} className="btn-primary w-full px-2 py-1 text-xs" done="Opening…" saved="">Create & send invoice</Tap>;
      else if (inv && balance > 0.5 && ["posted", "invoiced"].includes(d.stage)) action = <Tap action={markInvoicePaid.bind(null, inv.id)} className="btn-primary w-full px-2 py-1 text-xs" done="Paid ✓" saved="Marked as paid">Got paid ✓</Tap>;
    }
    return (
      <div key={d.id} className={`rounded-2xl bg-white p-3.5 shadow-sm ring-1 transition ${active ? "ring-2 ring-brand-500" : "ring-slate-200 hover:ring-slate-300"}`}>
        <Link href={keep({ deal: d.id })} scroll={false} className="block">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold">{d.brand.name}</div>
              <div className="truncate text-sm text-slate-500">{d.title}</div>
            </div>
            <div className="shrink-0 text-sm font-semibold">{d.amount ? rupees(d.amount) : d.is_barter ? "Barter" : ""}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {followDue && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Follow up {relativeDay(d.next_follow_up!, today).toLowerCase()}</span>}
            {d.due_date && ["confirmed", "in_progress"].includes(d.stage) && (
              <span className={`rounded-full px-2 py-0.5 ${late ? "bg-rose-100 text-rose-700" : "bg-amber-50 text-amber-800"}`}>Due {relativeDay(d.due_date, today).toLowerCase()}</span>
            )}
            {d.deliverables.length > 0 && ["confirmed", "in_progress"].includes(d.stage) && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{posted}/{d.deliverables.length} posted</span>}
            {inv && isOverdue(inv, today) && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Payment late</span>}
            {d.stage === "invoiced" && inv && !isOverdue(inv, today) && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">Invoiced</span>}
          </div>
        </Link>
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    );
  };

  const filters = [
    { id: "active", label: "In progress" },
    { id: "done", label: "Done" },
    { id: "lost", label: "Didn't happen" },
  ];

  const list =
    show === "active" ? (
      <div className={selected ? "space-y-5" : "grid gap-5 md:grid-cols-3"}>
        {GROUPS.map((g) => {
          const items = deals.filter((d) => (g.stages as readonly string[]).includes(d.stage));
          const total = items.reduce((s, d) => s + Number(d.amount ?? 0), 0);
          return (
            <section key={g.id} className="min-w-0">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="font-semibold">{g.label} <span className="text-sm font-normal text-slate-400">{items.length}</span></h2>
                {total > 0 && <span className="text-xs text-slate-500">{rupees(total)}</span>}
              </div>
              <div className="space-y-2.5">
                {items.map((d) => card(d, Boolean(selected)))}
                {!items.length && <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">{g.hint}</p>}
              </div>
            </section>
          );
        })}
      </div>
    ) : (
      <div className="space-y-2.5">
        {deals.map((d) => card(d, true))}
        {!deals.length && <p className="py-10 text-center text-sm text-slate-500">Nothing here.</p>}
      </div>
    );

  return (
    <div className={selected ? "" : "mx-auto max-w-6xl"}>
      <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 ${selected ? "hidden lg:flex" : ""}`}>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Work</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/deals" className="hidden sm:block">
            {show !== "active" && <input type="hidden" name="show" value={show} />}
            <input name="q" defaultValue={sp.q} placeholder="Search…" className="input w-40 py-1.5" />
          </form>
          <NewDeal brands={(brandRows ?? []).map((b) => b.name)} />
        </div>
      </div>
      <div className={`mb-4 flex gap-1.5 ${selected ? "hidden lg:flex" : ""}`}>
        {filters.map((f) => (
          <Link key={f.id} href={`/deals${f.id === "active" ? "" : `?show=${f.id}`}`} className={`rounded-full px-3 py-1.5 text-sm ${show === f.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {f.label}
          </Link>
        ))}
      </div>

      {selected ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
          <div className="hidden max-h-[calc(100dvh-10rem)] overflow-y-auto pr-1 lg:block">{list}</div>
          <div className="min-w-0 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <Link href={closeHref} className="mb-3 inline-block text-sm text-slate-500 lg:hidden">← All deals</Link>
            <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-slate-100" />}>
              <DealPanel id={selected} closeHref={closeHref} />
            </Suspense>
          </div>
        </div>
      ) : (
        list
      )}
    </div>
  );
}
