"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser client for Realtime subscriptions. Reads only what RLS allows. */
export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.");
  client = createBrowserClient(url, key);
  return client;
}

/**
 * Realtime applies RLS using the JWT the socket joined with. A channel joined
 * before the session is read would join as anon and receive nothing, so load
 * the session and hand its token to Realtime before subscribing.
 */
export async function realtimeClient(): Promise<SupabaseClient> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.realtime.setAuth(data.session.access_token);
  return supabase;
}
