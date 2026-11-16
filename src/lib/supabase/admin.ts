import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS — only use for operations that genuinely need it
 * (account deletion, Stripe webhooks). Never import this into client components.
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!publicEnv.supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_SECRET_KEY is not configured on the server.");
  }
  return createClient(publicEnv.supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
