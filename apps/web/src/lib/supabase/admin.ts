import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS: use only after the caller is authenticated
 * server-side and only for writes users may not make themselves (cache-hit
 * scans, audit rows, account deletion). The key never leaves the server:
 * this module is "server-only" and the variable has no NEXT_PUBLIC_ prefix.
 */
export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server only).");
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
