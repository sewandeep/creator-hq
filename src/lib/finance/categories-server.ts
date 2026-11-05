import "server-only";
import type { DB } from "@/app/actions/helpers";
import { ADDED_LATER, DEFAULT_CATEGORIES, isSajilo } from "./categories";

export type Category = { id: string; name: string; kind: string; emoji: string | null; is_business: boolean; position: number; direction: string; stream: string | null };

/** First use: create the starter categories. Returns all categories in order. */
export async function ensureCategories(supabase: DB): Promise<Category[]> {
  const load = () => supabase.from("categories").select("id, name, kind, emoji, is_business, position, direction, stream").order("position").order("name");
  let { data } = await load();
  if (!data?.length) {
    await supabase.from("categories").insert(DEFAULT_CATEGORIES.map((c, position) => ({ ...c, position, is_business: c.is_business ?? false, stream: c.stream ?? null })));
    data = (await load()).data;
  } else if (!data.some((c) => isSajilo(c.name))) {
    // Existing accounts: add the Sajilo pair once (skipped if you already have any "Sajilo …" category).
    const pos = Math.max(0, ...data.map((c) => c.position)) + 1;
    const extra = DEFAULT_CATEGORIES.filter((c) => ADDED_LATER.includes(c.name));
    await supabase.from("categories").insert(extra.map((c, i) => ({ ...c, position: pos + i, is_business: false, stream: c.stream ?? null })));
    data = (await load()).data;
  }
  return data ?? [];
}
