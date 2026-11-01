import "server-only";
import type { DB } from "@/app/actions/helpers";

export async function loadInvoiceFormOptions(supabase: DB) {
  const [brands, deals, profile] = await Promise.all([
    supabase.from("brands").select("id, name, legal_name, billing_address, gstin, pan").order("name"),
    supabase.from("deals").select("id, title, brand_id").neq("stage", "lost").order("deal_date", { ascending: false }),
    supabase.from("profile").select("*").maybeSingle(),
  ]);
  return { brands: brands.data ?? [], deals: deals.data ?? [], profile: profile.data };
}
