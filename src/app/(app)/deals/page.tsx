import type { Metadata } from "next";
import { Tap } from "@/components/tap";
import Link from "next/link";
import { Suspense } from "react";
import { invoiceAndSend, followedUp } from "@/app/actions/quick";
import { markInvoicePaid } from "@/app/actions/work";
import { moveDealToStage } from "@/app/actions/deals";
import { requireUser } from "@/lib/auth";
import { STAGES } from "@/lib/constants";
import { relativeDay, rupees, todayIST } from "@/lib/format";
import { isOverdue } from "@/lib/money";
import { DealPanel } from "./deal-panel";
import { PartyRule } from "./party-rule";
import { NewDeal } from "./work-parts";

export const metadata: Metadata = { title: "Work" };

type Search = { deal?: string; tab?: string; status?: string; q?: string };

const STATUSES = [
  { id: "ongoing", label: "Ongoing" },
  { id: "done", label: "Done" },
  { id: "lost", label: "Lost" },
  { id: "all", label: "All" },
] as const;

export default async function WorkPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = STATUSES.some((x) => x.id === sp.status) ? sp.status! : "ongoing";
  const { supabase } = await requireUser();
  const today = todayIST();

  let q = supabase
    .from("deals")
    .select("id, title, stage, amount, is_barter, due_date, next_follow_up, deal_date, agency_id, tds_rate, brand:brands!inner(id, name, is_agency, tds_rate), invoices(id, status, subtotal, due_date, payments(gross_amount, tds_amount)), deliverables(status)")
    .order("deal_date", { ascending: false });
  if (status === "ongoing") q = q.not("stage", "in", "(paid,lost)");
  if (status === "done") q = q.eq("stage", "paid").limit(300);
  if (status === "lost") q = q.eq("stage", "lost").limit(300);
  if (status === "all") q = q.limit(400);
  const [{ data }, { data: brandRows }] = await Promise.all([q, supabase.from("brands").select("id, name, is_agency, tds_rate").order("name")]);
  const needle = sp.q?.trim().toLowerCase() ?? "";
  const parties = new Map((brandRows ?? []).map((b) => [b.id, b]));
  const deals = (data ?? []).filter((d) => {
    if (!needle) return true;
    const agencyName = d.agency_id ? parties.get(d.agency_id)?.name ?? "" : "";
    return [d.title, d.brand.name, agencyName].some((x) => x.toLowerCase().includes(needle));
  });
  // A deal belongs to an agency if it came through one — or if its "brand" is itself marked as an agency.
  const agencyOf = (d: (typeof deals)[number]) => d.agency_id ?? (d.brand.is_agency ? d.brand.id : null);
  const viaAgency = deals.filter((d) => agencyOf(d));
  const direct = deals.filter((d) => !agencyOf(d));
  const tab = sp.tab === "brands" || sp.tab === "agencies" ? sp.tab : viaAgency.length || !direct.length ? "agencies" : "brands";

  const selected = sp.deal && /^[0-9a-f-]{36}$/.test(sp.deal) ? sp.deal : null;
  const keep = (extra: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    const all = { tab, status: status === "ongoing" ? undefined : status, q: sp.q, ...extra };
    Object.entries(all).forEach(([k, v]) => v && s.set(k, v));
    const str = s.toString();
    return `/deals${str ? `?${str}` : ""}`;
  };
  const closeHref = keep({ deal: undefined });

  const money = (d: (typeof deals)[number]) => {
    const inv = d.invoices.find((i) => i.status !== "cancelled");
    const counted = inv ? inv.payments.reduce((s, p) => s + Number(p.gross_amount), 0) : 0;
    const total = Number(inv?.subtotal ?? d.amount ?? 0);
    return { inv, counted, total, balance: inv ? Number(inv.subtotal) - counted : 0 };
  };

  const row = (d: (typeof deals)[number], showBrand: boolean) => {
    const { inv, counted, total, balance } = money(d);
    const followDue = d.next_follow_up && d.next_follow_up <= today && !["paid", "lost"].includes(d.stage);
    const late = d.due_date && d.due_date < today && ["confirmed", "in_progress"].includes(d.stage);
    const active = selected === d.id;
    const stage = STAGES.find((x) => x.id === d.stage);
    let action: React.ReactNode = null;
    if (!selected) {
      if (followDue) action = <Tap action={followedUp.bind(null, d.id, 3)} className="btn-secondary px-2 py-1 text-xs" saved="Follow-up logged" done="✓">Followed up ✓</Tap>;
      else if (["lead", "contacted", "negotiating"].includes(d.stage)) action = <Tap action={moveDealToStage.bind(null, d.id, "confirmed")} className="btn-secondary px-2 py-1 text-xs" done="✓" saved="Moved">They said yes →</Tap>;
      else if (d.stage === "posted" && !inv && d.amount) action = <Tap action={invoiceAndSend.bind(null, d.id)} className="btn-primary px-2 py-1 text-xs" done="Opening…" saved="">Invoice</Tap>;
      else if (inv && balance > 0.5 && ["posted", "invoiced"].includes(d.stage)) action = <Tap action={markInvoicePaid.bind(null, inv.id)} className="btn-primary px-2 py-1 text-xs" done="Paid ✓" saved="Marked as paid">Got paid ✓</Tap>;
    }
    return (
      <li key={d.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${active ? "bg-brand-50" : "hover:bg-slate-50"}`}>
        <Link href={keep({ deal: d.id })} scroll={false} className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium">{showBrand ? `${d.brand.is_agency && !d.agency_id ? "Brand not set" : d.brand.name} — ` : ""}{d.title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {stage && <span className={`rounded-full px-2 py-0.5 ${stage.color}`}>{stage.label}</span>}
            {followDue && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Follow up {relativeDay(d.next_follow_up!, today).toLowerCase()}</span>}
            {d.due_date && ["confirmed", "in_progress"].includes(d.stage) && <span className={`rounded-full px-2 py-0.5 ${late ? "bg-rose-100 text-rose-700" : "bg-amber-50 text-amber-800"}`}>Due {relativeDay(d.due_date, today).toLowerCase()}</span>}
            {inv && isOverdue(inv, today) && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Payment late</span>}
            {counted > 0 && counted < total - 1 && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">{Math.round((counted / total) * 100)}% paid</span>}
            {Number(d.tds_rate) > 0 && <span className="text-slate-400">TDS {Number(d.tds_rate)}%</span>}
          </div>
        </Link>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums">{d.amount ? rupees(d.amount) : d.is_barter ? "Barter" : ""}</div>
          {action && <div className="mt-1">{action}</div>}
        </div>
      </li>
    );
  };

  const groupCard = (partyId: string, list: typeof deals, showBrand: boolean) => {
    const party = parties.get(partyId);
    const total = list.reduce((s, d) => s + Number(d.amount ?? 0), 0);
    const waiting = list.reduce((s, d) => s + Math.max(0, money(d).balance), 0);
    return (
      <section key={partyId} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
          <div className="min-w-0">
            <Link href={`/brands/${partyId}`} className="font-semibold hover:underline">{party?.name ?? "—"}</Link>
            <span className="ml-2 text-xs text-slate-500">
              {list.length} deal{list.length === 1 ? "" : "s"}{total ? ` · ${rupees(total)}` : ""}{waiting > 0.5 ? ` · ${rupees(waiting)} waiting` : ""}
            </span>
          </div>
          {party && !selected && <PartyRule key={`${party.id}-${party.tds_rate}-${party.is_agency}`} brandId={party.id} isAgency={party.is_agency} tdsRate={party.tds_rate === null ? null : Number(party.tds_rate)} />}
        </div>
        <ul className="divide-y divide-slate-100">{list.map((d) => row(d, showBrand))}</ul>
      </section>
    );
  };

  const groupBy = (list: typeof deals, key: (d: (typeof deals)[number]) => string) => {
    const m = new Map<string, typeof deals>();
    for (const d of list) m.set(key(d), [...(m.get(key(d)) ?? []), d]);
    return [...m.entries()].sort((a, b) => (parties.get(a[0])?.name ?? "").localeCompare(parties.get(b[0])?.name ?? ""));
  };
  const groups = tab === "agencies" ? groupBy(viaAgency, (d) => agencyOf(d)!) : groupBy(direct, (d) => d.brand.id);

  const list = (
    <div className="space-y-3">
      {groups.map(([id, items]) => groupCard(id, items, tab === "agencies"))}
      {!groups.length && (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          {tab === "agencies"
            ? "No agency deals here. Open a deal and fill in “Through agency”, or mark a brand as an agency on the Brands tab."
            : "No direct brand deals here."}
        </p>
      )}
    </div>
  );

  const tabLink = (id: "agencies" | "brands", label: string, n: number) => (
    <Link href={keep({ tab: id, deal: undefined })} className={`rounded-xl px-3.5 py-1.5 text-sm font-medium ${tab === id ? "bg-white shadow-sm" : "text-slate-600"}`}>
      {label} <span className="text-slate-400">{n}</span>
    </Link>
  );

  return (
    <div className={selected ? "" : "mx-auto max-w-4xl"}>
      <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 ${selected ? "hidden lg:flex" : ""}`}>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Work</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/deals" className="hidden sm:block">
            <input type="hidden" name="tab" value={tab} />
            {status !== "ongoing" && <input type="hidden" name="status" value={status} />}
            <input name="q" defaultValue={sp.q} placeholder="Search…" className="input w-40 py-1.5" />
          </form>
          <NewDeal brands={(brandRows ?? []).filter((b) => !b.is_agency).map((b) => b.name)} agencies={(brandRows ?? []).filter((b) => b.is_agency).map((b) => b.name)} />
        </div>
      </div>
      <div className={`mb-4 flex flex-wrap items-center justify-between gap-2 ${selected ? "hidden lg:flex" : ""}`}>
        <div className="inline-flex rounded-2xl bg-slate-100 p-1">
          {tabLink("agencies", "Agencies", groupBy(viaAgency, (d) => agencyOf(d)!).length)}
          {tabLink("brands", "Brands", groupBy(direct, (d) => d.brand.id).length)}
        </div>
        <div className="flex gap-1.5">
          {STATUSES.map((f) => (
            <Link key={f.id} href={keep({ status: f.id === "ongoing" ? undefined : f.id, deal: undefined })} className={`rounded-full px-3 py-1.5 text-sm ${status === f.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
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
