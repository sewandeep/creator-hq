import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { STAGES } from "@/lib/constants";
import { relativeDay, rupees, todayIST } from "@/lib/format";
import { isOverdue } from "@/lib/money";
import type { Contact } from "@/lib/types";
import { AddContact, ContactRow } from "../brands/contact-parts";
import { DealPanel } from "./deal-panel";
import { PartyField } from "./party-parts";
import { PartyRule } from "./party-rule";
import { NewDeal } from "./work-parts";

export const metadata: Metadata = { title: "Work" };

type Search = { deal?: string; view?: string; party?: string; q?: string };

const VIEWS = [
  { id: "all", label: "All deals", icon: "📋", stages: null },
  { id: "leads", label: "New leads", icon: "🌱", stages: ["lead", "contacted", "negotiating"] },
  { id: "ongoing", label: "Ongoing", icon: "🎬", stages: ["confirmed", "in_progress", "posted", "invoiced"] },
  { id: "done", label: "Done", icon: "✅", stages: ["paid"] },
  { id: "lost", label: "Lost", icon: "✖️", stages: ["lost"] },
] as const;

export default async function WorkPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.id === sp.view) ?? VIEWS[0];
  const { supabase } = await requireUser();
  const today = todayIST();
  const isId = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : null);
  const selected = isId(sp.deal);
  const partyId = isId(sp.party);

  const [{ data }, { data: brandRows }, { data: contacts }] = await Promise.all([
    supabase
      .from("deals")
      .select("id, title, stage, amount, is_barter, due_date, next_follow_up, deal_date, agency_id, tds_rate, brand:brands!inner(id, name, is_agency), invoices(id, status, subtotal, due_date, payments(gross_amount, tds_amount))")
      .order("deal_date", { ascending: false })
      .limit(1000),
    supabase.from("brands").select("id, name, is_agency, tds_rate, legal_name, pan, tan, gstin, billing_address, website, instagram, notes").order("name"),
    partyId ? supabase.from("contacts").select("*").eq("brand_id", partyId).order("name") : Promise.resolve({ data: [] as Contact[] }),
  ]);
  const parties = new Map((brandRows ?? []).map((b) => [b.id, b]));
  const all = data ?? [];
  type D = (typeof all)[number];
  // A deal sits under its agency — or under its "brand" if that brand is itself an agency.
  const agencyOf = (d: D) => d.agency_id ?? (d.brand.is_agency ? d.brand.id : null);
  const brandLabel = (d: D) => (d.brand.is_agency && !d.agency_id ? "Brand not set" : d.brand.name);
  const inView = (d: D, v: (typeof VIEWS)[number]) => !v.stages || (v.stages as readonly string[]).includes(d.stage);
  const needle = sp.q?.trim().toLowerCase() ?? "";
  const matches = (d: D) => !needle || [d.title, d.brand.name, parties.get(agencyOf(d) ?? "")?.name ?? ""].some((x) => x.toLowerCase().includes(needle));
  const deals = all.filter((d) => inView(d, view) && matches(d));

  const keep = (extra: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    const v = { view: view.id === "all" ? undefined : view.id, party: partyId ?? undefined, q: sp.q, ...extra };
    Object.entries(v).forEach(([k, x]) => x && s.set(k, x));
    const str = s.toString();
    return `/deals${str ? `?${str}` : ""}`;
  };

  // ---------------------------------------------------------------- pieces
  const money = (d: D) => {
    const inv = d.invoices.find((i) => i.status !== "cancelled");
    const counted = inv ? inv.payments.reduce((s, p) => s + Number(p.gross_amount), 0) : 0;
    const total = Number(inv?.subtotal ?? d.amount ?? 0);
    return { inv, counted, total };
  };

  const dealRow = (d: D, label: string) => {
    const { inv, counted, total } = money(d);
    const stage = STAGES.find((x) => x.id === d.stage);
    const followDue = d.next_follow_up && d.next_follow_up <= today && !["paid", "lost"].includes(d.stage);
    return (
      <li key={d.id}>
        <Link href={keep({ deal: d.id })} scroll={false} className={`flex items-center gap-3 px-4 py-2.5 ${selected === d.id ? "bg-brand-50" : "hover:bg-slate-50"}`}>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px]">{label}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              {stage && <span className={`rounded-full px-2 py-0.5 ${stage.color}`}>{stage.label}</span>}
              {followDue && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Follow up {relativeDay(d.next_follow_up!, today).toLowerCase()}</span>}
              {inv && isOverdue(inv, today) && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Payment late</span>}
              {counted > 0 && counted < total - 1 && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">{Math.round((counted / total) * 100)}% paid</span>}
            </div>
          </div>
          <div className="shrink-0 text-sm font-semibold tabular-nums">{d.amount ? rupees(d.amount) : d.is_barter ? "Barter" : ""}</div>
        </Link>
      </li>
    );
  };

  const groupBy = (list: D[], key: (d: D) => string) => {
    const m = new Map<string, D[]>();
    for (const d of list) m.set(key(d), [...(m.get(key(d)) ?? []), d]);
    return [...m.entries()].sort((a, b) => (parties.get(a[0])?.name ?? a[0]).localeCompare(parties.get(b[0])?.name ?? b[0]));
  };

  const partyCard = (id: string, list: D[], isAgency: boolean) => {
    const p = parties.get(id);
    const total = list.reduce((s, d) => s + Number(d.amount ?? 0), 0);
    return (
      <section key={id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <Link href={keep({ party: id, deal: undefined })} className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5 hover:bg-slate-100">
          <span className="min-w-0">
            <span className="font-semibold">{p?.name}</span>
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${isAgency ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"}`}>{isAgency ? "Agency" : "Brand"}</span>
          </span>
          <span className="shrink-0 text-xs text-slate-500">{list.length} deal{list.length === 1 ? "" : "s"}{total ? ` · ${rupees(total)}` : ""} ›</span>
        </Link>
        <ul className="divide-y divide-slate-100">{list.map((d) => dealRow(d, isAgency ? `${brandLabel(d)} — ${d.title}` : d.title))}</ul>
      </section>
    );
  };

  // ---------------------------------------------------------------- sidebar
  const agencies = (brandRows ?? []).filter((b) => b.is_agency || all.some((d) => agencyOf(d) === b.id));
  const directBrands = (brandRows ?? []).filter((b) => !agencies.includes(b) && all.some((d) => d.brand.id === b.id && !agencyOf(d)));
  const countFor = (id: string) => all.filter((d) => agencyOf(d) === id || (!agencyOf(d) && d.brand.id === id)).length;
  const sideLink = (href: string, label: React.ReactNode, active: boolean, n?: number) => (
    <Link key={href} href={href} className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
      <span className="min-w-0 truncate">{label}</span>
      {n !== undefined && <span className={`text-xs ${active ? "text-slate-300" : "text-slate-400"}`}>{n}</span>}
    </Link>
  );
  const sidebar = (
    <nav className="space-y-4">
      <div className="space-y-0.5">
        {VIEWS.map((v) => sideLink(`/deals${v.id === "all" ? "" : `?view=${v.id}`}`, `${v.icon} ${v.label}`, !partyId && !selected && view.id === v.id, all.filter((d) => inView(d, v)).length))}
      </div>
      <div>
        <div className="mb-1 px-2.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Agencies</div>
        <div className="space-y-0.5">{agencies.map((a) => sideLink(`/deals?party=${a.id}`, a.name, partyId === a.id, countFor(a.id)))}</div>
        {!agencies.length && <p className="px-2.5 text-xs text-slate-400">None yet — fill in “Through agency” on a deal.</p>}
      </div>
      <div>
        <div className="mb-1 px-2.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Brands (direct)</div>
        <div className="space-y-0.5">{directBrands.map((b) => sideLink(`/deals?party=${b.id}`, b.name, partyId === b.id, countFor(b.id)))}</div>
      </div>
    </nav>
  );

  // ---------------------------------------------------------------- main
  let main: React.ReactNode;
  if (selected) {
    main = (
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <Link href={keep({ deal: undefined })} className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">← Back</Link>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-slate-100" />}>
          <DealPanel id={selected} closeHref={keep({ deal: undefined })} />
        </Suspense>
      </div>
    );
  } else if (partyId && parties.get(partyId)) {
    const p = parties.get(partyId)!;
    const isAgency = p.is_agency || all.some((d) => agencyOf(d) === p.id);
    const mine = all.filter((d) => (isAgency ? agencyOf(d) === p.id : d.brand.id === p.id));
    const received = mine.reduce((s, d) => s + d.invoices.flatMap((i) => i.payments).reduce((t, x) => t + Number(x.gross_amount) - Number(x.tds_amount), 0), 0);
    const tds = mine.reduce((s, d) => s + d.invoices.flatMap((i) => i.payments).reduce((t, x) => t + Number(x.tds_amount), 0), 0);
    const byBrand = groupBy(mine, (d) => (d.brand.is_agency && !d.agency_id ? "Brand not set" : d.brand.id));
    main = (
      <div className="space-y-5">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-[12rem] flex-1">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isAgency ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"}`}>{isAgency ? "Agency" : "Brand"}</span>
              <div className="mt-1 text-xl font-semibold">
                <PartyField key={`n-${p.name}`} brandId={p.id} field="name" label="" value={p.name} />
              </div>
            </div>
            <PartyRule key={`${p.id}-${p.tds_rate}-${p.is_agency}`} brandId={p.id} isAgency={p.is_agency} tdsRate={p.tds_rate === null ? null : Number(p.tds_rate)} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-slate-50 py-2"><div className="font-semibold">{mine.length}</div><div className="text-xs text-slate-500">deals</div></div>
            <div className="rounded-xl bg-slate-50 py-2"><div className="font-semibold">{rupees(received)}</div><div className="text-xs text-slate-500">received</div></div>
            <div className="rounded-xl bg-slate-50 py-2"><div className="font-semibold">{rupees(tds)}</div><div className="text-xs text-slate-500">TDS cut</div></div>
          </div>
          <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{isAgency ? "Agency details" : "Brand details"} <span className="font-normal normal-case">· tap to change</span></h3>
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            <PartyField key={`l-${p.legal_name}`} brandId={p.id} field="legal_name" label="Legal name (on invoices)" value={p.legal_name} />
            <PartyField key={`g-${p.gstin}`} brandId={p.id} field="gstin" label="GSTIN" value={p.gstin} />
            <PartyField key={`p-${p.pan}`} brandId={p.id} field="pan" label="PAN" value={p.pan} />
            <PartyField key={`t-${p.tan}`} brandId={p.id} field="tan" label="TAN (shows in your 26AS)" value={p.tan} />
            <PartyField key={`a-${p.billing_address}`} brandId={p.id} field="billing_address" label="Billing address" value={p.billing_address} long />
            <PartyField key={`w-${p.website}`} brandId={p.id} field="website" label="Website" value={p.website} />
            <PartyField key={`i-${p.instagram}`} brandId={p.id} field="instagram" label="Instagram" value={p.instagram} />
            <PartyField key={`o-${p.notes}`} brandId={p.id} field="notes" label="Notes" value={p.notes} long />
          </div>
          <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">People</h3>
          <div className="space-y-2">
            {(contacts ?? []).map((c) => <ContactRow key={c.id} c={c} brandId={p.id} />)}
            <AddContact brandId={p.id} />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold">{isAgency ? "Deals through this agency" : "Deals"}</h2>
          {isAgency ? (
            byBrand.map(([bid, list]) => (
              <section key={bid} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-sm font-semibold">{bid === "Brand not set" ? "Brand not set" : parties.get(bid)?.name}</div>
                <ul className="divide-y divide-slate-100">{list.map((d) => dealRow(d, d.title))}</ul>
              </section>
            ))
          ) : (
            <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <ul className="divide-y divide-slate-100">{mine.map((d) => dealRow(d, d.agency_id ? `${d.title} (via ${parties.get(d.agency_id)?.name})` : d.title))}</ul>
            </section>
          )}
          {!mine.length && <p className="text-sm text-slate-500">No deals yet.</p>}
        </div>
      </div>
    );
  } else {
    const viaAgency = groupBy(deals.filter((d) => agencyOf(d)), (d) => agencyOf(d)!);
    const direct = groupBy(deals.filter((d) => !agencyOf(d)), (d) => d.brand.id);
    main = (
      <div className="space-y-6">
        {viaAgency.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Agencies</h2>
            {viaAgency.map(([id, list]) => partyCard(id, list, true))}
          </div>
        )}
        {direct.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Brands (direct)</h2>
            {direct.map(([id, list]) => partyCard(id, list, false))}
          </div>
        )}
        {!deals.length && <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">Nothing here.</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Work</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/deals" className="hidden sm:block">
            {view.id !== "all" && <input type="hidden" name="view" value={view.id} />}
            <input name="q" defaultValue={sp.q} placeholder="Search…" className="input w-40 py-1.5" />
          </form>
          <NewDeal brands={(brandRows ?? []).filter((b) => !b.is_agency).map((b) => b.name)} agencies={agencies.map((a) => a.name)} />
        </div>
      </div>

      {/* Phone: views as chips + agencies/brands in a drop-down */}
      <div className="mb-4 space-y-2 lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {VIEWS.map((v) => (
            <Link key={v.id} href={`/deals${v.id === "all" ? "" : `?view=${v.id}`}`} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${!partyId && !selected && view.id === v.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
              {v.label}
            </Link>
          ))}
        </div>
        <details className="rounded-xl bg-white ring-1 ring-slate-200">
          <summary className="cursor-pointer px-3 py-2 text-sm text-slate-600">{partyId ? `📁 ${parties.get(partyId)?.name}` : "📁 Agencies & brands"}</summary>
          <div className="max-h-80 overflow-y-auto border-t border-slate-100 p-2">{sidebar}</div>
        </details>
      </div>

      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
        <aside className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1">{sidebar}</div>
        </aside>
        <div className="min-w-0">{main}</div>
      </div>
    </div>
  );
}
