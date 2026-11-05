import { EVIDENCE_LIMITS, WellKnownFileSchema, type WellKnownFile } from "@red/shared";
import type { CappedResponse } from "../net/fetcher";
import { capUrl, truncateBytes } from "./util";

export const WELL_KNOWN_PATHS = [
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.json",
  "/.well-known/security.txt",
  "/humans.txt",
] as const;

const TEXTUAL = /^(text\/|application\/(json|xml|manifest\+json|ld\+json|xhtml\+xml))/i;

export function buildWellKnown(path: string, url: string, res: CappedResponse | null, error: string | null): WellKnownFile {
  if (!res) {
    return WellKnownFileSchema.parse({ path, url: capUrl(url), status: null, exists: false, bytes: null, contentType: null, head: null, truncated: false, error: error?.slice(0, 200) ?? null });
  }
  const ct = res.headers["content-type"] ?? null;
  const ok = res.status >= 200 && res.status < 300;
  // Many sites answer every path with their HTML app shell. That is not the file.
  const isHtmlShell = ok && /text\/html/i.test(ct ?? "") && path !== "/sitemap.xml";
  const exists = ok && !isHtmlShell;
  const text = exists && (ct == null || TEXTUAL.test(ct)) ? res.body.toString("utf8") : null;
  const head = text == null ? null : truncateBytes(text, EVIDENCE_LIMITS.wellKnownHeadBytes);
  return WellKnownFileSchema.parse({
    path,
    url: capUrl(res.url),
    status: res.status,
    exists,
    bytes: res.bytes,
    contentType: ct?.slice(0, 200) ?? null,
    head: head?.text ?? null,
    truncated: (head?.truncated ?? false) || res.truncated,
    error: isHtmlShell ? "served an HTML page, not the file" : null,
  });
}
