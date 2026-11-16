"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Browser client (publishable key only). Used for auth forms and direct-to-storage uploads, both RLS-enforced. */
export function getBrowserClient() {
  if (!client) {
    client = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseKey);
  }
  return client;
}
