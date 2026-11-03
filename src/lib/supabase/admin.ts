import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SUPABASE_URL } from "./env";

/**
 * Server-only database client for the Telegram bot and the daily reminder
 * job, which run without a browser login. Uses the secret key, so it is never
 * sent to the browser. `actingUserId` is stamped on every row it creates.
 */
export function createAdminClient(actingUserId?: string, extraHeaders: Record<string, string> = {}) {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) throw new Error("Missing SUPABASE_SECRET_KEY (needed for the Telegram bot and reminders).");
  return createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // x-group-id groups this client's changes in the change log (for Undo).
    global: { headers: { ...(actingUserId ? { "x-acting-user": actingUserId } : {}), "x-group-id": crypto.randomUUID(), ...extraHeaders } },
  });
}

export function isAdminConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
}
