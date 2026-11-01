import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteBrand, updateBrand } from "@/app/actions/brands";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Empty, PageHeader, Stat, StageBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, rupees } from "@/lib/format";
import { BrandFields } from "../brand-fields";
import { AddContact, ContactRow } from "../contact-parts";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("brands").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Brand" };
}

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: brand }, { data: deals }, { data: contacts }] = await Promise.all([
    supabase.from("brands").select("*").eq("id", id).maybeSingle(),
    supabase.from("deals").select("id, title, stage, amount, is_barter, deal_date, deliverables(type, quantity)").eq("brand_id", id).order("deal_date", { ascending: false }),
    supabase.from("contacts").select("*").eq("brand_id", id).order("name"),
  ]);
  if (!brand) notFound();

  const all = deals ?? [];
  const paid = all.filter((d) => d.stage === "paid");
  const earned = paid.reduce((t, d) => t + Number(d.amount ?? 0), 0);
  const pending = all.filter((d) => ["confirmed", "in_progress", "posted", "invoiced"].includes(d.stage)).reduce((t, d) => t + Number(d.amount ?? 0), 0);
  const first = all.at(-1)?.deal_date;

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/brands" className="text-slate-500 hover:underline">Brands</Link>
      </div>
      <PageHeader
        title={brand.name}
        subtitle={[brand.category, brand.instagram].filter(Boolean).join(" · ") || undefined}
        actions={<Link href={`/deals/new?brand=${brand.id}`} className="btn-primary">+ New deal</Link>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Deals" value={all.length} hint={first ? `Since ${fmtDate(first)}` : undefined} />
        <Stat label="Earned (paid)" value={rupees(earned)} hint={`${paid.length} paid deals`} />
        <Stat label="Pending" value={rupees(pending)} hint="Confirmed, not yet paid" />
        <Stat label="Avg. per paid deal" value={paid.length ? rupees(earned / paid.length) : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Deal history">
            {all.length ? (
              <ul className="divide-y divide-slate-100">
                {all.map((d) => (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{d.title}</div>
                        <div className="text-xs text-slate-500">
                          {fmtDate(d.deal_date)}
                          {d.deliverables.length > 0 && " · " + d.deliverables.map((x) => `${x.quantity > 1 ? `${x.quantity}× ` : ""}${x.type}`).join(", ")}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium tabular-nums">{d.amount ? rupees(d.amount) : d.is_barter ? "Barter" : "—"}</span>
                        <StageBadge stage={d.stage} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No deals with {brand.name} yet.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <div id="contacts">
            <Card title="Contacts">
              <div className="space-y-4">
                {contacts?.map((c) => <ContactRow key={c.id} c={c} brandId={brand.id} />)}
                <AddContact brandId={brand.id} />
              </div>
            </Card>
          </div>

          <Card title="Brand details">
            <ActionForm action={updateBrand.bind(null, brand.id)} className="space-y-4">
              <BrandFields brand={brand} />
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
            {all.length === 0 && (
              <ActionForm action={deleteBrand.bind(null, brand.id)} className="mt-4 border-t border-slate-100 pt-4">
                <SubmitButton className="btn-danger" pendingText="Deleting…">Delete brand</SubmitButton>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
