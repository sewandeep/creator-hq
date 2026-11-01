import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type DB = SupabaseClient<Database>;

/** Refresh every page after a change. It's a one-person app, so this stays simple. */
export function refreshAll() {
  revalidatePath("/", "layout");
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
