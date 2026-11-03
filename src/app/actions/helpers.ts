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
