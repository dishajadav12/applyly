import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";
import { requireEnv } from "@/lib/env";

/**
 * Admin (secret-key) client. Bypasses RLS. Use ONLY for gmail_connections;
 * user data goes through the session client.
 */
export function createAdminClient() {
  return createClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
