import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { Database } from "./database.types";
import { SUPABASE_KEY, SUPABASE_URL, assertSupabaseEnv } from "./env";

/**
 * One client per request. Its changes share one "group id" in the change log,
 * so everything a single tap did can be undone together.
 */
// One group id per request, however many clients that request creates.
const groupIds = new WeakMap<object, string>();

export async function createClient() {
  assertSupabaseEnv();
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  let groupId = groupIds.get(requestHeaders);
  if (!groupId) {
    groupId = crypto.randomUUID();
    groupIds.set(requestHeaders, groupId);
  }
  const client = createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { "x-group-id": groupId } },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
  return Object.assign(client, { groupId });
}
