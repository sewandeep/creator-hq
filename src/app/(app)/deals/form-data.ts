import "server-only";
import type { DB } from "@/app/actions/helpers";

export async function loadFormOptions(supabase: DB) {
  const [brands, contacts] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("contacts").select("id, name, email, brand_id").order("name"),
  ]);
  return { brands: brands.data ?? [], contacts: contacts.data ?? [] };
}
