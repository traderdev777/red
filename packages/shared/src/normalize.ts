/**
 * Canonical form of a URL for caching and dedupe. Two inputs that load the same
 * page should produce the same `normalized` string and therefore the same hash.
 *
 *   - scheme and host lowercased, trailing dot and default port dropped
 *   - fragment removed
 *   - tracking parameters removed (utm_*, click ids, mailing-list ids)
 *   - remaining query parameters sorted by key, then value (order-stable)
 *   - trailing slash removed from the path, including a bare "/"
 *
 * Path case is preserved: paths are case-sensitive on most servers.
 * Isomorphic: uses Web Crypto, available in browsers and Node 18+.
 */

const TRACKING_EXACT = new Set([
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "yclid",
  "twclid",
  "ttclid",
  "li_fat_id",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "_hsenc",
  "_hsmi",
  "mkt_tok",
  "vero_id",
  "vero_conv",
  "oly_anon_id",
  "oly_enc_id",
  "rb_clickid",
  "s_cid",
  "ref_src",
  "spm",
]);
const TRACKING_PREFIX = ["utm_", "pk_", "mtm_", "hsa_"];

export function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return TRACKING_EXACT.has(k) || TRACKING_PREFIX.some((p) => k.startsWith(p));
}

/** Synchronous part: the canonical string. Throws on an unparseable URL. */
export function canonicalUrl(input: string): string {
  const u = new URL(input.trim());
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/\.$/, "");
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80"))
    u.port = "";

  const kept = [...u.searchParams.entries()].filter(([k]) => !isTrackingParam(k));
  kept.sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);

  let out = u.toString();
  // URL always serializes "/" for an empty path; strip it, and any trailing slash before ? or end.
  out = out.replace(/\/+(?=\?|$)/, "");
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function normalizeUrl(input: string): Promise<{ normalized: string; hash: string }> {
  const normalized = canonicalUrl(input);
  return { normalized, hash: await sha256Hex(normalized) };
}
