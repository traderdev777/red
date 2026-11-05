import { EVIDENCE_LIMITS, NetworkSchema, type Network, type NetworkEntry } from "@red/shared";
import { isThirdParty, registrableDomain } from "@red/shared/third-parties";
import { capUrl, hostOf, lowerHeaders, round } from "./util";

/** The CDP Network events we keep, recorded as-is (fixtures use this shape). */
export interface CdpRecord {
  requestId: string;
  url: string;
  method: string;
  type: string; // Document, Script, Stylesheet, Image, Font, XHR, Fetch, ...
  initiator: { type: string; url?: string; stack?: { callFrames?: { url: string }[] } };
  /** CDP monotonic seconds. */
  startTs: number;
  endTs?: number;
  status?: number;
  responseHeaders?: Record<string, string>;
  mimeType?: string;
  fromCache?: boolean;
  encodedDataLength?: number;
  failed?: string;
}

export function initiatorUrl(i: CdpRecord["initiator"]): string | null {
  const u = i.url || i.stack?.callFrames?.find((f) => f.url)?.url;
  return u ? capUrl(u) : null;
}

export function buildNetwork(records: CdpRecord[], siteHost: string): Network {
  // data:, blob: and chrome-extension: URLs never touch the network.
  const sorted = records.filter((r) => /^https?:/i.test(r.url)).sort((a, b) => a.startTs - b.startTs);
  const t0 = sorted[0]?.startTs ?? 0;
  const byType: Record<string, { count: number; bytes: number }> = {};
  let transferBytes = 0;
  const entries: NetworkEntry[] = [];
  for (const r of sorted) {
    const type = r.type.toLowerCase();
    const bytes = r.encodedDataLength != null ? Math.round(r.encodedDataLength) : null;
    transferBytes += bytes ?? 0;
    const bucket = (byType[type] ??= { count: 0, bytes: 0 });
    bucket.count += 1;
    bucket.bytes += bytes ?? 0;
    if (entries.length >= EVIDENCE_LIMITS.networkEntries) continue;
    const h = lowerHeaders(r.responseHeaders ?? {});
    const host = hostOf(r.url);
    entries.push({
      url: capUrl(r.url),
      method: r.method.slice(0, 16),
      resourceType: type.slice(0, 32),
      status: r.status ?? null,
      transferBytes: bytes,
      startMs: round((r.startTs - t0) * 1000) ?? 0,
      durationMs: r.endTs != null ? round((r.endTs - r.startTs) * 1000) : null,
      initiator: { type: r.initiator.type.slice(0, 32), url: initiatorUrl(r.initiator) },
      domain: registrableDomain(host).slice(0, 256),
      party: isThirdParty(host, siteHost) ? "third" : "first",
      contentType: (h["content-type"] ?? r.mimeType ?? null)?.slice(0, 200) ?? null,
      cache: {
        cacheControl: h["cache-control"]?.slice(0, 500) ?? null,
        age: h["age"]?.slice(0, 50) ?? null,
        etag: "etag" in h,
        lastModified: "last-modified" in h,
        expires: h["expires"]?.slice(0, 100) ?? null,
      },
      fromCache: !!r.fromCache,
      failed: r.failed?.slice(0, 200) ?? null,
    });
  }
  return NetworkSchema.parse({
    entries,
    totalRequests: sorted.length,
    truncated: sorted.length > EVIDENCE_LIMITS.networkEntries,
    transferBytes,
    byType,
  });
}
