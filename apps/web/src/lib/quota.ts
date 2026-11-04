import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface QuotaView {
  role: "user" | "owner";
  used: number;
  limit: number;
}

/** Today's usage (UTC day, same as consume_scan_quota) read through RLS. */
export async function readQuota(supabase: SupabaseClient, user: User): Promise<QuotaView> {
  const day = new Date().toISOString().slice(0, 10);
  const [{ data: profile }, { data: usage }] = await Promise.all([
    supabase.from("profiles").select("role, daily_scan_limit").eq("id", user.id).maybeSingle(),
    supabase.from("scan_usage").select("count").eq("user_id", user.id).eq("day", day).maybeSingle(),
  ]);
  return {
    role: profile?.role === "owner" ? "owner" : "user",
    used: usage?.count ?? 0,
    limit: profile?.daily_scan_limit ?? 5,
  };
}
