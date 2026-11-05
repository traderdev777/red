import { EVIDENCE_LIMITS } from "@red/shared";

export const capUrl = (u: string) => (u.length > EVIDENCE_LIMITS.urlChars ? u.slice(0, EVIDENCE_LIMITS.urlChars) : u);
export const cap = (s: string | null | undefined, n: number) => (s == null ? null : s.length > n ? s.slice(0, n) : s);
export const round = (n: number | null | undefined, d = 0) =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d;

/** Truncate a UTF-8 string to at most `bytes` bytes without splitting a code point. */
export function truncateBytes(s: string, bytes: number): { text: string; truncated: boolean; bytes: number } {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= bytes) return { text: s, truncated: false, bytes: buf.length };
  let end = bytes;
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end--;
  return { text: buf.subarray(0, end).toString("utf8"), truncated: true, bytes: buf.length };
}

export function hostOf(u: string): string {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function lowerHeaders(h: Record<string, string>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) o[k.toLowerCase()] = v;
  return o;
}

/** RFC 3339 UTC ("2026-11-04T05:05:12.345Z"), built by hand so no runtime Date patching can change it. */
export function isoUtc(d: Date | number = new Date()): string {
  const x = typeof d === "number" ? new Date(d) : d;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(x.getUTCFullYear(), 4)}-${p(x.getUTCMonth() + 1)}-${p(x.getUTCDate())}T${p(x.getUTCHours())}:${p(x.getUTCMinutes())}:${p(x.getUTCSeconds())}.${p(x.getUTCMilliseconds(), 3)}Z`;
}
