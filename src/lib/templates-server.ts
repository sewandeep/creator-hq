import "server-only";
import type { DB } from "@/app/actions/helpers";
import { DEFAULT_TEMPLATES } from "./templates";

/** First visit: give you a starter set of email templates. */
export async function ensureDefaultTemplates(supabase: DB) {
  const { count } = await supabase.from("email_templates").select("id", { count: "exact", head: true });
  if (count) return;
  await supabase.from("email_templates").insert(DEFAULT_TEMPLATES.map((t, position) => ({ ...t, position })));
}
