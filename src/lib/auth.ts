import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Checked once per page load and shared by the layout and the page (saves round trips).
const loadUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return { supabase, userId: userId ?? null, email: (data?.claims?.email as string | undefined) ?? "", groupId: supabase.groupId };
});

/** Returns a Supabase client for the logged-in user, or sends them to /login. */
export async function requireUser() {
  const u = await loadUser();
  if (!u.userId) redirect("/login");
  return { supabase: u.supabase, userId: u.userId, email: u.email, groupId: u.groupId };
}
