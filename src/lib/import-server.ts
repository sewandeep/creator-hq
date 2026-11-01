import "server-only";
import type { DB } from "@/app/actions/helpers";
import { findOrCreateBrand } from "@/app/actions/helpers";
import { DONE_STAGES } from "@/lib/constants";
import { todayIST } from "@/lib/format";
import type { ImportRow } from "@/lib/import";

/** Saves past collaborations (brands, contacts, deals, deliverables). */
export async function importRowsCore(supabase: DB, rows: ImportRow[]): Promise<{ deals: number; brands: number; skipped: number; error?: string }> {
  const { count: brandsBefore } = await supabase.from("brands").select("id", { count: "exact", head: true });
  const brandIds = new Map<string, string>();
  let deals = 0;
  let skipped = 0;

  try {
    for (const row of rows) {
      if (!row.brand) {
        skipped++;
        continue;
      }
      const key = row.brand.toLowerCase();
      let brandId = brandIds.get(key);
      if (!brandId) {
        brandId = await findOrCreateBrand(supabase, row.brand);
        brandIds.set(key, brandId);
      }

      let contactId: string | null = null;
      if (row.contact_name || row.contact_email) {
        let q = supabase.from("contacts").select("id").eq("brand_id", brandId);
        q = row.contact_email ? q.ilike("email", row.contact_email) : q.ilike("name", row.contact_name!);
        const { data: existing } = await q.limit(1).maybeSingle();
        if (existing) contactId = existing.id;
        else {
          const { data: created, error } = await supabase
            .from("contacts")
            .insert({ brand_id: brandId, name: row.contact_name ?? row.contact_email!, email: row.contact_email })
            .select("id")
            .single();
          if (error) throw error;
          contactId = created.id;
        }
      }

      const { data: deal, error } = await supabase
        .from("deals")
        .insert({
          brand_id: brandId,
          contact_id: contactId,
          title: row.title,
          stage: row.stage,
          platform: row.platform,
          amount: row.is_barter && !row.amount ? null : row.amount,
          is_barter: row.is_barter,
          deal_date: row.deal_date ?? todayIST(),
          notes: row.notes,
        })
        .select("id")
        .single();
      if (error) throw error;
      deals++;

      const done = DONE_STAGES.includes(row.stage);
      const deliverables = row.deliverables.length ? row.deliverables : row.link ? [{ type: "Other", quantity: 1 }] : [];
      if (deliverables.length) {
        const { error: dError } = await supabase.from("deliverables").insert(
          deliverables.map((d, i) => ({
            deal_id: deal.id,
            type: d.type,
            quantity: d.quantity,
            platform: row.platform,
            status: done ? ("posted" as const) : ("todo" as const),
            posted_date: done ? row.deal_date : null,
            link: i === 0 ? row.link : null,
            notes: "note" in d ? d.note : null,
          })),
        );
        if (dError) throw dError;
      }

      await supabase.from("activities").insert({
        deal_id: deal.id,
        brand_id: brandId,
        kind: "system",
        body: "Imported from past work",
      });
    }
  } catch (e) {
    const message = e && typeof e === "object" && "message" in e ? String(e.message) : "Unknown error";
    return { error: `Stopped after ${deals} deals: ${message}`, deals, skipped, brands: 0 };
  }

  const { count: brandsAfter } = await supabase.from("brands").select("id", { count: "exact", head: true });
  return { deals, skipped, brands: (brandsAfter ?? 0) - (brandsBefore ?? 0) };
}
