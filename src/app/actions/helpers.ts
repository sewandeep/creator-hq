import "server-only";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type DB = SupabaseClient<Database>;

/**
 * Refresh every page after a change. Returns this request's change-group id,
 * so the screen can offer "Undo" for exactly what the tap changed.
 */
export async function refreshAll(): Promise<{ groupId: string }> {
  revalidatePath("/", "layout");
  const { groupId } = await requireUser();
  return { groupId };
}

/** Finds a brand by name (case-insensitive) or creates it. */
export async function findOrCreateBrand(supabase: DB, name: string): Promise<string> {
  const clean = name.trim().replace(/\s+/g, " ");
  const { data: existing, error: findError } = await supabase
    .from("brands")
    .select("id")
    .ilike("name", clean.replace(/[%_\\]/g, (c) => `\\${c}`))
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data, error } = await supabase.from("brands").insert({ name: clean }).select("id").single();
  if (error) throw error;
  return data.id;
}

/** An agency by name (created and marked as an agency if new), with its TDS rule. */
export async function findOrCreateAgency(supabase: DB, name: string): Promise<{ id: string; tdsRate: number | null }> {
  const id = await findOrCreateBrand(supabase, name);
  const { data } = await supabase.from("brands").update({ is_agency: true }).eq("id", id).select("tds_rate").single();
  return { id, tdsRate: data?.tds_rate === null || data?.tds_rate === undefined ? null : Number(data.tds_rate) };
}

/** The TDS rule a new deal starts with: the agency's, else the brand's, else none set. */
export async function startingTdsRate(supabase: DB, brandId: string, agency: { tdsRate: number | null } | null) {
  if (agency && agency.tdsRate !== null) return agency.tdsRate;
  const { data } = await supabase.from("brands").select("tds_rate").eq("id", brandId).single();
  return data?.tds_rate === null || data?.tds_rate === undefined ? null : Number(data.tds_rate);
}
