import "server-only";
import type { DB } from "@/app/actions/helpers";
import { DONE_STAGES } from "@/lib/constants";
import { fyRange } from "@/lib/fy";

/** All finished work (posted / invoiced / paid), optionally for one financial year. */
export async function loadHistory(supabase: DB, fy: number | null) {
  let q = supabase
    .from("deals")
    .select("id, title, stage, amount, is_barter, barter_value, platform, deal_date, brand:brands!inner(id, name, category), deliverables(type, quantity, link)")
    .in("stage", DONE_STAGES)
    .order("deal_date", { ascending: false });
  if (fy !== null) {
    const { from, to } = fyRange(fy);
    q = q.gte("deal_date", from).lte("deal_date", to);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
