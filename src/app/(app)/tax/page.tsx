import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { rupees, todayIST } from "@/lib/format";
import { fyLabel, fyOf, fyRange } from "@/lib/fy";
import { CheckForm } from "./check-row";

export const metadata: Metadata = { title: "TDS & 26AS" };

type Row = {
  brandId: string;
  name: string;
  tan: string | null;
  gross: number;
  tds: number;
  sections: Set<string>;
  check: { tds_in_26as: number | null; amount_in_26as: number | null; notes: string | null } | null;
};

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const { fy: fyParam } = await searchParams;
  const { supabase } = await requireUser();
  const currentFy = fyOf(todayIST());
  // Default to last year once it's tax-filing season (Apr–Jul), otherwise this year.
  const month = Number(todayIST().slice(5, 7));
  const defaultFy = month >= 4 && month <= 7 ? currentFy - 1 : currentFy;
  const fy = fyParam && /^\d{4}$/.test(fyParam) ? Number(fyParam) : defaultFy;
  const { from, to } = fyRange(fy);

  const [{ data: payments }, { data: checks }] = await Promise.all([
    supabase.from("payments").select("brand_id, gross_amount, tds_amount, tds_section, brand:brands(id, name, tan)").gte("received_date", from).lte("received_date", to),
    supabase.from("tds_checks").select("*, brand:brands(id, name, tan)").eq("fy", fy),
  ]);

  const rows = new Map<string, Row>();
  for (const p of payments ?? []) {
    const r = rows.get(p.brand_id) ?? { brandId: p.brand_id, name: p.brand?.name ?? "", tan: p.brand?.tan ?? null, gross: 0, tds: 0, sections: new Set<string>(), check: null };
    r.gross += Number(p.gross_amount);
    r.tds += Number(p.tds_amount);
    if (p.tds_section && Number(p.tds_amount) > 0) r.sections.add(p.tds_section);
    rows.set(p.brand_id, r);
  }
  for (const c of checks ?? []) {
    const r = rows.get(c.brand_id) ?? { brandId: c.brand_id, name: c.brand?.name ?? "", tan: c.brand?.tan ?? null, gross: 0, tds: 0, sections: new Set<string>(), check: null };
    r.check = { tds_in_26as: c.tds_in_26as === null ? null : Number(c.tds_in_26as), amount_in_26as: c.amount_in_26as === null ? null : Number(c.amount_in_26as), notes: c.notes };
    rows.set(c.brand_id, r);
  }
  const list = [...rows.values()].filter((r) => r.tds > 0 || r.check).sort((a, b) => b.tds - a.tds);

  const status = (r: Row) => {
    if (!r.check || r.check.tds_in_26as === null) return { tone: "slate" as const, label: "Not checked", detail: "" };
    const diff = r.check.tds_in_26as - r.tds;
    if (Math.abs(diff) <= 1) return { tone: "green" as const, label: "Matches", detail: "" };
    if (diff < 0)
      return { tone: "red" as const, label: `Short by ${rupees(-diff)}`, detail: "The brand cut this TDS but hasn't deposited/filed it under your PAN. Ask them to file or revise their TDS return — otherwise you can't claim it." };
    return { tone: "amber" as const, label: `26AS shows ${rupees(diff)} more`, detail: "26AS has more than your records — you may have missed recording a payment from this brand." };
  };

  const myTds = list.reduce((t, r) => t + r.tds, 0);
  const in26as = list.reduce((t, r) => t + (r.check?.tds_in_26as ?? 0), 0);
  const checked = list.filter((r) => r.check?.tds_in_26as !== null && r.check?.tds_in_26as !== undefined).length;
  const problems = list.filter((r) => ["red", "amber"].includes(status(r).tone)).length;

  return (
    <>
      <PageHeader
        title="TDS & 26AS check"
        subtitle={`${fyLabel(fy)} · make sure every rupee of TDS brands cut actually shows up under your PAN`}
        actions={
          <div className="flex gap-1">
            <Link href={`/tax?fy=${fy - 1}`} className="btn-secondary">← {fyLabel(fy - 1)}</Link>
            {fy < currentFy && <Link href={`/tax?fy=${fy + 1}`} className="btn-secondary">{fyLabel(fy + 1)} →</Link>}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="TDS cut (your records)" value={rupees(myTds)} hint="From payments you recorded" />
        <Stat label="TDS showing in 26AS" value={rupees(in26as)} hint={`${checked} of ${list.length} brands checked`} />
        <Stat label="Difference" value={rupees(in26as - myTds)} />
        <Stat label="Need attention" value={problems} hint={problems ? "Brands with a mismatch" : "All good so far"} />
      </div>

      {list.length === 0 ? (
        <Empty action={<Link href="/payments" className="btn-secondary">Go to payments</Link>}>No TDS recorded for {fyLabel(fy)} yet. TDS shows up here once you record payments with TDS.</Empty>
      ) : (
        <div className="card mb-6 divide-y divide-slate-100">
          {list.map((r) => {
            const s = status(r);
            return (
              <div key={r.brandId} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/brands/${r.brandId}`} className="font-medium hover:underline">{r.name}</Link>
                    <div className="text-xs text-slate-500">
                      TAN {r.tan ?? "not added"} · paid {rupees(r.gross)}
                      {r.sections.size ? ` · ${[...r.sections].join(", ")}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Your records</div>
                      <div className="font-medium tabular-nums">{rupees(r.tds)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">26AS</div>
                      <div className="font-medium tabular-nums">{r.check?.tds_in_26as === null || !r.check ? "—" : rupees(r.check.tds_in_26as)}</div>
                    </div>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                </div>
                {s.detail && <p className="mt-1 text-xs text-slate-600">{s.detail}</p>}
                <CheckForm fy={fy} brandId={r.brandId} tan={r.tan} tds={r.check?.tds_in_26as ?? null} amount={r.check?.amount_in_26as ?? null} notes={r.check?.notes ?? null} />
              </div>
            );
          })}
        </div>
      )}

      <Card title="How to check your 26AS / AIS (takes 5 minutes)">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          <li>Log in at <b>incometax.gov.in</b> with your PAN.</li>
          <li>Go to <b>e-File → Income Tax Returns → View Form 26AS</b> (or open <b>AIS</b> from the Services menu).</li>
          <li>Pick assessment year <b>{fyLabel(fy + 1).replace("FY", "AY")}</b> for {fyLabel(fy)}, and view it as HTML or PDF.</li>
          <li>In <b>Part-I</b>, each brand appears by name and TAN with &quot;Total Tax Deducted&quot;. Enter that number next to the brand above.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Brands deposit TDS quarterly, so 26AS can lag 1–3 months behind. Check after each quarter, and definitely before filing your ITR. (In a later phase, you&apos;ll be able to upload the 26AS PDF and have it read automatically.)
        </p>
      </Card>
    </>
  );
}
