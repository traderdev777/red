import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { normalizeUrl, sha256Hex, StartScanInputSchema } from "@red/shared";
import { assertPublicUrl, UnsafeUrlError } from "@red/shared/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "./rateLimit";
import { ipHash } from "./request";

export const CACHE_DAYS = 7;
/** Free retries are allowed for failures before analysis, up to this attempt number. */
export const MAX_FREE_ATTEMPT = 3;

export type StartScanResult =
  | { ok: true; scanId: string; cached: boolean }
  | {
      ok: false;
      code: "invalid" | "unsafe-url" | "rate-limited" | "quota" | "error" | "not-found";
      message: string;
    };

type AuditEvent = "scan.created" | "scan.cached" | "scan.retried" | "scan.rejected";

async function audit(
  event: AuditEvent,
  userId: string,
  urlHash: string,
  ip: string,
  scanId?: string,
) {
  const { error } = await supabaseAdmin()
    .from("scan_audit")
    .insert({
      event,
      user_id: userId,
      url_hash: urlHash,
      ip_hash: await ipHash(ip),
      scan_id: scanId ?? null,
    });
  if (error) console.error("scan_audit insert failed", error.code, error.message);
}

function limited(userId: string, ip: string): StartScanResult | null {
  const perUser = rateLimit(`scan:user:${userId}`, { max: 10, windowMs: 60_000 });
  const perIp = rateLimit(`scan:ip:${ip}`, { max: 30, windowMs: 60_000 });
  if (perUser.ok && perIp.ok) return null;
  const s = Math.max(perUser.retryAfterS, perIp.retryAfterS);
  return {
    ok: false,
    code: "rate-limited",
    message: `Too many scan requests. Try again in ${s}s.`,
  };
}

/**
 * Charges one unit of the daily quota through the user's own session, so
 * Postgres sees auth.uid() and enforces "only your own quota".
 */
async function chargeQuota(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc("consume_scan_quota", { p_user_id: userId }).single<{
    allowed: boolean;
    used: number;
    quota_limit: number | null;
    is_owner: boolean;
  }>();
  if (error || !data) throw new Error(`consume_scan_quota failed: ${error?.message ?? "no row"}`);
  return data;
}

function quotaMessage(used: number, limit: number | null) {
  return `Daily limit reached: ${used} of ${limit ?? used} scans used today. The count resets at 00:00 UTC.`;
}

export async function startScanCore(opts: {
  supabase: SupabaseClient;
  user: User;
  rawUrl: unknown;
  ip: string;
}): Promise<StartScanResult> {
  const { supabase, user, ip } = opts;
  const parsed = StartScanInputSchema.safeParse({ url: opts.rawUrl });
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: parsed.error.issues[0]?.message ?? "Invalid URL.",
    };
  }

  const tooMany = limited(user.id, ip);
  if (tooMany) return tooMany;

  let safe;
  try {
    safe = await assertPublicUrl(parsed.data.url);
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      await audit("scan.rejected", user.id, await sha256Hex(parsed.data.url.trim()), ip);
      return { ok: false, code: "unsafe-url", message: e.message };
    }
    throw e;
  }

  const { normalized, hash } = await normalizeUrl(safe.url);
  const admin = supabaseAdmin();

  // Cache: any finished scan of the same URL in the last 7 days. Free, instant.
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
  const { data: hit, error: cacheError } = await admin
    .from("scans")
    .select("id, result, cached_from")
    .eq("url_hash", hash)
    .eq("status", "done")
    .gte("finished_at", since)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cacheError) console.error("cache lookup failed", cacheError.message);

  if (hit) {
    const { data: row, error } = await admin
      .from("scans")
      .insert({
        user_id: user.id,
        url: safe.url,
        normalized_url: normalized,
        url_hash: hash,
        status: "done",
        progress: 100,
        result: hit.result,
        cached_from: hit.cached_from ?? hit.id,
        quota_charged: false,
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !row)
      return {
        ok: false,
        code: "error",
        message: "Couldn't create the scan. Nothing was charged.",
      };
    await audit("scan.cached", user.id, hash, ip, row.id);
    return { ok: true, scanId: row.id, cached: true };
  }

  const quota = await chargeQuota(supabase, user.id);
  if (!quota.allowed) {
    return { ok: false, code: "quota", message: quotaMessage(quota.used, quota.quota_limit) };
  }

  const { data: row, error } = await admin
    .from("scans")
    .insert({
      user_id: user.id,
      url: safe.url,
      normalized_url: normalized,
      url_hash: hash,
      status: "queued",
      quota_charged: !quota.is_owner,
    })
    .select("id")
    .single();

  if (error || !row) {
    if (!quota.is_owner) await admin.rpc("release_scan_quota", { p_user_id: user.id });
    return {
      ok: false,
      code: "error",
      message: "Couldn't create the scan. Your quota was not used.",
    };
  }
  await audit("scan.created", user.id, hash, ip, row.id);
  return { ok: true, scanId: row.id, cached: false };
}

export async function retryScanCore(opts: {
  supabase: SupabaseClient;
  user: User;
  scanId: string;
  ip: string;
}): Promise<StartScanResult> {
  const { supabase, user, scanId, ip } = opts;
  const tooMany = limited(user.id, ip);
  if (tooMany) return tooMany;

  // Read through RLS: a scan that isn't yours is "not found".
  const { data: prev } = await supabase
    .from("scans")
    .select("id, url, normalized_url, url_hash, status, failed_stage, attempt")
    .eq("id", scanId)
    .maybeSingle();
  if (!prev) return { ok: false, code: "not-found", message: "That scan doesn't exist." };
  if (prev.status !== "failed")
    return { ok: false, code: "invalid", message: "Only failed scans can be retried." };

  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from("scans")
    .select("id")
    .eq("retry_of", prev.id)
    .maybeSingle();
  if (existing) return { ok: true, scanId: existing.id, cached: false };

  // DNS can change between attempts: check again.
  try {
    await assertPublicUrl(prev.url);
  } catch (e) {
    if (e instanceof UnsafeUrlError) return { ok: false, code: "unsafe-url", message: e.message };
    throw e;
  }

  const failedBeforeAnalysis = prev.failed_stage === "queued" || prev.failed_stage === "collecting";
  const free = failedBeforeAnalysis && prev.attempt < MAX_FREE_ATTEMPT;
  let charged = false;
  if (!free) {
    const quota = await chargeQuota(supabase, user.id);
    if (!quota.allowed)
      return { ok: false, code: "quota", message: quotaMessage(quota.used, quota.quota_limit) };
    charged = !quota.is_owner;
  }

  const { data: row, error } = await admin
    .from("scans")
    .insert({
      user_id: user.id,
      url: prev.url,
      normalized_url: prev.normalized_url,
      url_hash: prev.url_hash,
      status: "queued",
      retry_of: prev.id,
      attempt: prev.attempt + 1,
      quota_charged: charged,
    })
    .select("id")
    .single();

  if (error || !row) {
    if (charged) await admin.rpc("release_scan_quota", { p_user_id: user.id });
    if (error?.code === "23505") {
      const { data: again } = await admin
        .from("scans")
        .select("id")
        .eq("retry_of", prev.id)
        .maybeSingle();
      if (again) return { ok: true, scanId: again.id, cached: false };
    }
    return {
      ok: false,
      code: "error",
      message: "Couldn't create the retry. Your quota was not used.",
    };
  }
  await audit("scan.retried", user.id, prev.url_hash, ip, row.id);
  return { ok: true, scanId: row.id, cached: false };
}
