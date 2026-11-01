import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, StageBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { STAGES, STAGE_IDS } from "@/lib/constants";
import { fmtDate, rupees, todayIST } from "@/lib/format";
import { Board } from "./board";

export const metadata: Metadata = { title: "Deals" };

type Search = { view?: string; q?: string; stage?: string; lost?: string };

export default async function DealsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { view = "board", q = "", stage = "", lost } = await searchParams;
  const { supabase } = await requireUser();
  const today = todayIST();

  let query = supabase
    .from("deals")
    .select("id, title, stage, amount, is_barter, deal_date, due_date, next_follow_up, brand:brands!inner(id, name)")
    .order("deal_date", { ascending: false });
  if (stage && (STAGE_IDS as string[]).includes(stage)) query = query.eq("stage", stage as never);
  const { data, error } = await query;
  if (error) throw error;

  const needle = q.trim().toLowerCase();
  const deals = (data ?? []).filter(
    (d) => !needle || d.title.toLowerCase().includes(needle) || d.brand.name.toLowerCase().includes(needle),
  );

  const params = (p: Partial<Search>) => {
    const s = new URLSearchParams();
    const merged = { view, q, stage, lost, ...p };
    Object.entries(merged).forEach(([k, v]) => v && s.set(k, v));
    return `/deals?${s.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Deals"
        subtitle={`${deals.length} deal${deals.length === 1 ? "" : "s"}`}
        actions={
          <>
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
              <Link href={params({ view: "board", stage: "" })} className={`rounded-md px-3 py-1 ${view !== "list" ? "bg-slate-900 text-white" : "text-slate-600"}`}>
                Board
              </Link>
              <Link href={params({ view: "list" })} className={`rounded-md px-3 py-1 ${view === "list" ? "bg-slate-900 text-white" : "text-slate-600"}`}>
                List
              </Link>
            </div>
            <Link href="/deals/new" className="btn-primary">
              + New deal
            </Link>
          </>
        }
      />

      <form className="mb-4 flex flex-wrap gap-2" action="/deals">
        <input type="hidden" name="view" value={view} />
        <input name="q" defaultValue={q} placeholder="Search brand or deal…" className="input max-w-xs" />
        {view === "list" && (
          <select name="stage" defaultValue={stage} className="input w-auto">
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        {view !== "list" && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="lost" value="1" defaultChecked={Boolean(lost)} /> Show lost
          </label>
        )}
        <button className="btn-secondary">Filter</button>
      </form>

      {deals.length === 0 && !needle && !stage ? (
        <Empty
          action={
            <div className="flex justify-center gap-2">
              <Link href="/deals/new" className="btn-primary">Add your first deal</Link>
              <Link href="/import" className="btn-secondary">Import past work</Link>
            </div>
          }
        >
          No deals yet.
        </Empty>
      ) : view === "list" ? (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr>
                <th className="th">Brand</th>
                <th className="th">Deal</th>
                <th className="th">Stage</th>
                <th className="th text-right">Amount</th>
                <th className="th">Date</th>
                <th className="th">Due</th>
                <th className="th">Follow up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deals.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="td font-medium">
                    <Link href={`/brands/${d.brand.id}`} className="hover:underline">{d.brand.name}</Link>
                  </td>
                  <td className="td">
                    <Link href={`/deals/${d.id}`} className="link">{d.title}</Link>
                  </td>
                  <td className="td"><StageBadge stage={d.stage} /></td>
                  <td className="td text-right tabular-nums">{d.amount ? rupees(d.amount) : d.is_barter ? "Barter" : "—"}</td>
                  <td className="td whitespace-nowrap text-slate-600">{fmtDate(d.deal_date)}</td>
                  <td className="td whitespace-nowrap text-slate-600">{fmtDate(d.due_date)}</td>
                  <td className={`td whitespace-nowrap ${d.next_follow_up && d.next_follow_up <= today ? "font-medium text-rose-600" : "text-slate-600"}`}>
                    {fmtDate(d.next_follow_up)}
                  </td>
                </tr>
              ))}
              {deals.length === 0 && (
                <tr><td colSpan={7} className="td py-8 text-center text-slate-500">No deals match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <Board
          today={today}
          showLost={Boolean(lost)}
          deals={deals.map((d) => ({
            id: d.id,
            title: d.title,
            stage: d.stage,
            amount: d.amount,
            is_barter: d.is_barter,
            due_date: d.due_date,
            next_follow_up: d.next_follow_up,
            brand: d.brand.name,
          }))}
        />
      )}
    </>
  );
}
