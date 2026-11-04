import "server-only";

/**
 * Fixed-window limiter held in process memory, keyed by any string
 * ("waitlist:<ip>", "scan:user:<id>", "scan:ip:<ip>").
 * Correct for one Node instance and for dev. On serverless or several
 * instances each keeps its own window: move the store to Redis (e.g. Upstash)
 * before relying on it as abuse protection. The daily scan quota itself is
 * enforced in Postgres and is not affected by this.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export interface Limit {
  max: number;
  windowMs: number;
}

export function rateLimit(
  key: string,
  { max, windowMs }: Limit = { max: 5, windowMs: 10 * 60 * 1000 },
  now = Date.now(),
): { ok: boolean; retryAfterS: number } {
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterS: 0 };
  }
  entry.count += 1;
  return entry.count > max
    ? { ok: false, retryAfterS: Math.ceil((entry.resetAt - now) / 1000) }
    : { ok: true, retryAfterS: 0 };
}
