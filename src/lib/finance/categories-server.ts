import "server-only";
import type { DB } from "@/app/actions/helpers";
import { DEFAULT_CATEGORIES } from "./categories";

export type Category = { id: string; name: string; kind: string; emoji: string | null; is_business: boolean; position: number };

/** First use: create the starter categories. Returns all categories in order. */
export async function ensureCategories(supabase: DB): Promise<Category[]> {
  const load = () => supabase.from("categories").select("id, name, kind, emoji, is_business, position").order("position").order("name");
  let { data } = await load();
  if (!data?.length) {
    await supabase.from("categories").insert(DEFAULT_CATEGORIES.map((c, position) => ({ ...c, position, is_business: c.is_business ?? false })));
    data = (await load()).data;
  }
  return data ?? [];
}
