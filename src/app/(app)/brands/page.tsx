import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, rupees } from "@/lib/format";

export const metadata: Metadata = { title: "Brands" };

export default async function BrandsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, category, deals(amount, stage, deal_date), contacts(id)")
    .order("name");
  if (error) throw error;

  const needle = q.trim().toLowerCase();
  const brands = (data ?? [])
    .filter((b) => !needle || b.name.toLowerCase().includes(needle) || b.category?.toLowerCase().includes(needle))
    .map((b) => {
      const paid = b.deals.filter((d) => d.stage === "paid");
      const last = b.deals.map((d) => d.deal_date).sort().at(-1) ?? null;
      return {
        ...b,
        dealCount: b.deals.length,
        earned: paid.reduce((t, d) => t + Number(d.amount ?? 0), 0),
        open: b.deals.filter((d) => !["paid", "lost"].includes(d.stage)).length,
        last,
      };
    });

  return (
    <>
      <PageHeader
        title="Brands"
        subtitle={`${brands.length} brand${brands.length === 1 ? "" : "s"}`}
        actions={<Link href="/brands/new" className="btn-primary">+ New brand</Link>}
      />
      <form className="mb-4 flex gap-2" action="/brands">
        <input name="q" defaultValue={q} placeholder="Search brands…" className="input max-w-xs" />
        <button className="btn-secondary">Search</button>
      </form>
      {brands.length === 0 ? (
        <Empty action={<Link href="/brands/new" className="btn-primary">Add a brand</Link>}>No brands yet.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr>
                <th className="th">Brand</th>
                <th className="th">Category</th>
                <th className="th text-right">Deals</th>
                <th className="th text-right">Open</th>
                <th className="th text-right">Earned</th>
                <th className="th">Last deal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {brands.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="td font-medium"><Link href={`/brands/${b.id}`} className="link">{b.name}</Link></td>
                  <td className="td text-slate-600">{b.category ?? "—"}</td>
                  <td className="td text-right tabular-nums">{b.dealCount}</td>
                  <td className="td text-right tabular-nums">{b.open || "—"}</td>
                  <td className="td text-right font-medium tabular-nums">{b.earned ? rupees(b.earned) : "—"}</td>
                  <td className="td whitespace-nowrap text-slate-600">{fmtDate(b.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
