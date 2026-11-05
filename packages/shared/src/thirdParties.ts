/**
 * Deterministic third-party classification. The list lives in
 * packages/shared/data/third-parties.json; nothing here guesses.
 */
import data from "../data/third-parties.json";
import type { ThirdPartyCategory } from "./evidence";

interface Entry {
  domain: string;
  vendor: string;
  category: ThirdPartyCategory;
}

const ENTRIES = (data as { entries: Entry[] }).entries
  .slice()
  .sort((a, b) => b.domain.length - a.domain.length);

/**
 * Multi-label public suffixes we see in practice. A heuristic, not the full
 * Public Suffix List: unknown multi-label suffixes fall back to the last two
 * labels, which can over-group (two unrelated *.example.co.xx sites).
 */
const MULTI_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "co.in", "net.in", "org.in", "gov.in", "ac.in",
  "com.au", "net.au", "org.au", "co.nz", "co.jp", "ne.jp", "or.jp", "com.br", "com.mx",
  "com.ar", "com.sg", "com.hk", "com.tw", "com.cn", "co.za", "co.kr", "com.tr", "com.my",
  "com.ph", "com.vn", "com.pk", "com.bd", "com.ng", "co.id", "co.il", "com.sa", "com.eg",
  // Platform suffixes where every subdomain is a different owner.
  "github.io", "vercel.app", "netlify.app", "pages.dev", "herokuapp.com", "web.app",
  "firebaseapp.com", "myshopify.com", "wordpress.com", "blogspot.com", "azurewebsites.net",
  "cloudfront.net", "fly.dev", "onrender.com", "railway.app", "framer.website", "webflow.io",
  "workers.dev", "amplifyapp.com", "appspot.com",
]);

/** eTLD+1 by heuristic: "a.b.example.co.uk" -> "example.co.uk". */
export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (/^[\d.]+$/.test(h) || h.includes(":")) return h; // IP literal
  const labels = h.split(".");
  if (labels.length <= 2) return h;
  const last2 = labels.slice(-2).join(".");
  if (MULTI_SUFFIXES.has(last2)) return labels.slice(-3).join(".");
  return last2;
}

export function isThirdParty(host: string, siteHost: string): boolean {
  return registrableDomain(host) !== registrableDomain(siteHost);
}

/** Longest dot-suffix match against the list, else null. */
export function classifyHost(host: string): Entry | null {
  const h = host.toLowerCase();
  for (const e of ENTRIES) {
    if (h === e.domain || h.endsWith(`.${e.domain}`)) return e;
  }
  return null;
}

export const THIRD_PARTY_LIST_VERSION = (data as { version: number }).version;
