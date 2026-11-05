/**
 * Evidence catalog: every fact the analysis may cite, built mechanically from
 * evidence.json. Ids are stable and readable ("hdr.server", "lh.largest-contentful-paint").
 * The model only ever sees and cites these; it cannot add to them.
 */
import { SECURITY_HEADERS, type EvidenceDoc } from "@red/shared";
import type { z } from "zod";
import type { EvidenceSchema } from "@red/shared";

export type CatalogItem = z.infer<typeof EvidenceSchema>;
export type Catalog = Map<string, CatalogItem>;

const clip = (s: string, n = 600) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const kb = (n: number | null | undefined) => (n == null ? "unknown size" : `${(n / 1024).toFixed(1)} KB`);

export function buildCatalog(doc: EvidenceDoc, unavailable: ReadonlySet<string> = new Set(), fromMobile: ReadonlySet<string> = new Set()): Catalog {
  const c: Catalog = new Map();
  const at = doc.collectedAt;
  const d = doc.passes.desktop;
  const page = d.navigation.finalUrl;
  const add = (item: Omit<CatalogItem, "capturedAt" | "url"> & { url?: string }) => {
    if (c.has(item.id)) return;
    c.set(item.id, { ...item, url: item.url ?? page, excerpt: clip(item.excerpt), capturedAt: at });
  };

  // Navigation
  add({ id: "nav.final", source: "network-request", excerpt: `GET ${page} -> HTTP ${d.navigation.status}; TTFB ${d.navigation.timing.ttfbMs ?? "n/a"} ms, DOMContentLoaded ${d.navigation.timing.domContentLoadedMs ?? "n/a"} ms, load ${d.navigation.timing.loadMs ?? "n/a"} ms`, locator: "desktop navigation" });
  d.navigation.redirectChain.forEach((h, i) =>
    add({ id: `nav.redirect.${i}`, source: "network-request", url: h.url, excerpt: `${h.status} ${h.url} -> ${h.location ?? "?"}`, locator: `redirect hop ${i + 1}` }),
  );

  // Headers (present) and security headers (absent)
  for (const h of d.document.headers) {
    add({ id: `hdr.${h.name}`, source: "http-header", excerpt: `${h.name}: ${h.value}`, locator: `response header ${h.name}` });
  }
  for (const name of SECURITY_HEADERS) {
    if (!d.document.security[name]) {
      add({ id: `hdr-missing.${name}`, source: "http-header", excerpt: `No ${name} header on the document response (${d.document.headers.length} headers received).`, locator: "document response headers" });
    }
  }

  const via = (part: string) => (fromMobile.has(part) ? " (read on the mobile pass; the desktop probe timed out)" : "");
  for (const part of unavailable) {
    add({ id: `probe.${part}`, source: "dom-snapshot", excerpt: `The ${part} probe did not answer in time on either pass (the page kept its main thread busy), so nothing is concluded from it.`, locator: `probe ${part}` });
  }

  // Head
  const h = d.head;
  if (!unavailable.has("head")) {
  add({ id: "meta.title", source: "html", excerpt: h.title ? `<title>${h.title}</title>` : "No <title> element in the rendered page.", locator: "head > title" });
  add({ id: "meta.description", source: "html", excerpt: h.description ? `<meta name="description" content="${h.description}">` : 'No <meta name="description"> in the rendered page.', locator: 'meta[name="description"]' });
  add({ id: "meta.canonical", source: "html", excerpt: h.canonical ? `<link rel="canonical" href="${h.canonical}">` : 'No <link rel="canonical"> in the rendered page.', locator: 'link[rel="canonical"]' });
  add({ id: "meta.viewport", source: "html", excerpt: h.viewport ? `<meta name="viewport" content="${h.viewport}">` : 'No <meta name="viewport">.', locator: 'meta[name="viewport"]' });
  add({ id: "meta.lang", source: "html", excerpt: h.lang ? `<html lang="${h.lang}">` : "The <html> element has no lang attribute.", locator: "html[lang]" });
  if (h.generator) add({ id: "meta.generator", source: "html", excerpt: `<meta name="generator" content="${h.generator}">`, locator: 'meta[name="generator"]' });
  if (h.robots) add({ id: "meta.robots", source: "html", excerpt: `<meta name="robots" content="${h.robots}">`, locator: 'meta[name="robots"]' });
  const og = Object.entries(h.og);
  add({ id: "meta.og", source: "html", excerpt: og.length ? og.map(([k, v]) => `og:${k}=${v}`).join("; ") : "No Open Graph (og:*) meta tags.", locator: 'meta[property^="og:"]' });
  h.jsonLd.forEach((j, i) => add({ id: `jsonld.${i}`, source: "html", excerpt: `JSON-LD block ${i + 1}: ${j.valid ? `types ${j.types.join(", ") || "(none)"}` : "invalid JSON"} (${j.bytes} bytes)`, locator: `script[type="application/ld+json"]:nth-of-type(${i + 1})` }));
  if (via("head")) for (const id of ["meta.title", "meta.description", "meta.canonical", "meta.viewport", "meta.lang", "meta.og"]) {
    const it = c.get(id);
    if (it) it.excerpt = clip(`${it.excerpt}${via("head")}`);
  }
  }

  // Runtime globals (presence only)
  for (const [k, v] of unavailable.has("runtime") ? [] : Object.entries(d.runtime.globals)) {
    if (v) add({ id: `runtime.${k}`, source: "dom-snapshot", excerpt: `Runtime probe "${k}" was present in the page.`, locator: `runtime probe ${k}` });
  }

  // Vitals (lab, one load each)
  for (const [pass, p] of [["desktop", d], ["mobile", doc.passes.mobile]] as const) {
    if (!p) continue;
    const v = p.vitals;
    if (v.lcpMs != null) add({ id: `vital.${pass}.lcp`, source: "dom-snapshot", excerpt: `Largest Contentful Paint ${v.lcpMs} ms (${pass} ${p.viewport.width}x${p.viewport.height}, one lab load)`, locator: "PerformanceObserver largest-contentful-paint" });
    if (v.cls != null) add({ id: `vital.${pass}.cls`, source: "dom-snapshot", excerpt: `Cumulative Layout Shift ${v.cls} (${pass}, one lab load)`, locator: "PerformanceObserver layout-shift" });
    if (v.fcpMs != null) add({ id: `vital.${pass}.fcp`, source: "dom-snapshot", excerpt: `First Contentful Paint ${v.fcpMs} ms (${pass})`, locator: "PerformanceObserver paint" });
    if (v.tbtProxyMs != null) add({ id: `vital.${pass}.tbt`, source: "dom-snapshot", excerpt: `Long-task blocking time after FCP ${v.tbtProxyMs} ms (${pass}, TBT proxy)`, locator: "PerformanceObserver longtask" });
  }

  // Lighthouse
  const lh = doc.lighthouse;
  if (lh.status === "ok") {
    for (const [k, v] of Object.entries(lh.scores)) {
      if (v != null) add({ id: `lh.score.${k}`, source: "lighthouse", excerpt: `Lighthouse ${k} score ${v}/100 (mobile profile, v${lh.version})`, locator: `categories.${k}` });
    }
    for (const a of lh.audits) {
      add({ id: `lh.${a.id}`, source: "lighthouse", excerpt: `${a.title}: ${a.displayValue ?? "no value"}${a.score != null ? ` (audit score ${a.score})` : ""}`, locator: `audits.${a.id}` });
    }
  } else {
    add({ id: "lh.status", source: "lighthouse", excerpt: `Lighthouse ${lh.status}: ${lh.reason ?? ""}`, locator: "lighthouse" });
  }

  // Network: totals plus the requests that matter (largest, slowest, failed)
  add({ id: "net.totals", source: "network-request", excerpt: `${d.network.totalRequests} requests, ${kb(d.network.transferBytes)} transferred on the desktop load; by type: ${Object.entries(d.network.byType).map(([t, s]) => `${t} ${s.count} (${kb(s.bytes)})`).join(", ")}`, locator: "desktop network log" });
  const ranked = new Set<number>();
  const entries = d.network.entries;
  [...entries.keys()].sort((a, b) => (entries[b]!.transferBytes ?? 0) - (entries[a]!.transferBytes ?? 0)).slice(0, 8).forEach((i) => ranked.add(i));
  [...entries.keys()].sort((a, b) => (entries[b]!.durationMs ?? 0) - (entries[a]!.durationMs ?? 0)).slice(0, 5).forEach((i) => ranked.add(i));
  entries.forEach((e, i) => (e.failed || (e.status ?? 0) >= 400) && ranked.add(i));
  for (const i of [...ranked].slice(0, 30)) {
    const e = entries[i]!;
    add({ id: `net.${i}`, source: e.resourceType === "script" ? "script" : e.resourceType === "stylesheet" ? "stylesheet" : "network-request", url: e.url, excerpt: `${e.method} ${e.url} -> ${e.failed ?? e.status ?? "?"}; ${e.resourceType}; ${kb(e.transferBytes)}; ${e.durationMs ?? "?"} ms; ${e.party}-party; cache-control: ${e.cache.cacheControl ?? "none"}`, locator: `network entry ${i}` });
  }

  // Scripts: blocking candidates are external scripts with neither async, defer, nor module
  const blocking = d.assets.scripts.filter((s) => !s.async && !s.defer && !s.module);
  if (!unavailable.has("assets") && d.assets.scripts.length) {
    add({ id: "assets.scripts", source: "script", excerpt: `${d.assets.scripts.length} external scripts (${d.assets.scripts.filter((s) => s.party === "third").length} third-party), ${blocking.length} without async/defer/module; ${d.assets.inlineScripts.count} inline scripts, ${d.assets.inlineScripts.bytes} bytes inline`, locator: "document.scripts" });
  }
  (unavailable.has("assets") ? [] : blocking).slice(0, 6).forEach((s, i) => add({ id: `script.sync.${i}`, source: "script", url: s.url, excerpt: `<script src="${s.url}"> with no async, defer, or type=module (${s.party}-party, ${kb(s.bytes)})`, locator: "script[src]" }));

  // Cookies
  for (const ck of unavailable.has("cookies") ? [] : d.cookies) {
    add({ id: `cookie.${ck.name}@${ck.domain}`, source: "http-header", excerpt: `Cookie ${ck.name} (domain ${ck.domain}, path ${ck.path}): ${ck.secure ? "Secure" : "not Secure"}, ${ck.httpOnly ? "HttpOnly" : "not HttpOnly"}, SameSite=${ck.sameSite ?? "unset"}, ${ck.expires ? `expires ${ck.expires.slice(0, 10)}` : "session"}${ck.thirdParty ? ", third-party" : ""}. Value not recorded.`, locator: `cookie ${ck.name}` });
  }

  // Third parties
  for (const t of doc.thirdParties.slice(0, 40)) {
    add({ id: `tp.${t.domain}`, source: "network-request", url: `https://${t.domain}/`, excerpt: `${t.requests} requests to ${t.domain}${t.vendor ? ` (${t.vendor}, ${t.category})` : " (not in the vendor list)"}, ${kb(t.transferBytes)}`, locator: `third party ${t.domain}` });
  }

  // Console
  d.console.errors.slice(0, 10).forEach((e, i) => add({ id: `console.${i}`, source: "dom-snapshot", url: e.url ?? page, excerpt: `console error: ${e.text}`, locator: "console" }));

  // Site files
  for (const w of doc.wellKnown) {
    add({ id: `wk.${w.path.replace(/^\//, "")}`, source: "network-request", url: w.url, excerpt: w.exists ? `${w.path} exists (HTTP ${w.status}, ${w.bytes ?? "?"} bytes): ${(w.head ?? "").slice(0, 300)}` : `${w.path} not found (${w.status != null ? `HTTP ${w.status}` : w.error ?? "no response"}${w.error && w.status != null ? `, ${w.error}` : ""})`, locator: w.path });
  }

  // Source maps
  doc.sourceMaps.referenced.slice(0, 10).forEach((r, i) => add({ id: `sm.ref.${i}`, source: "script", url: r.assetUrl, excerpt: `${r.assetUrl} references a source map ${r.mapUrl} (via ${r.via})`, locator: r.via === "header" ? "SourceMap header" : "sourceMappingURL comment" }));
  doc.sourceMaps.fetched.forEach((f, i) => {
    if (!f.mapUrl.startsWith("http")) return;
    add({ id: `sm.map.${i}`, source: "script", url: f.mapUrl, excerpt: f.skipped ? `Source map ${f.mapUrl} not read: ${f.skipped}` : `Source map ${f.mapUrl} is public (HTTP ${f.status}) and lists ${f.sourcesCount} source files, e.g. ${f.sources.slice(0, 5).join(", ")}`, locator: "sources[]" });
  });

  // TLS / DNS
  if (doc.tls) add({ id: "tls", source: "network-request", excerpt: `TLS ${doc.tls.protocol ?? "?"}, certificate for ${doc.tls.subject ?? "?"} issued by ${doc.tls.issuer ?? "?"}, valid ${doc.tls.validFrom?.slice(0, 10) ?? "?"} to ${doc.tls.validTo?.slice(0, 10) ?? "?"}`, locator: "securityDetails" });
  if (doc.dns) {
    add({ id: "dns", source: "dns", url: `https://${doc.dns.hostname}/`, excerpt: `${doc.dns.hostname}: ${doc.dns.cnameChain.length ? `CNAME ${doc.dns.cnameChain.join(" -> ")}; ` : ""}addresses ${doc.dns.addresses.map((a) => a.address).join(", ")}${doc.dns.asn.length ? `; ${doc.dns.asn.map((a) => `AS${a.asn} ${a.org ?? ""}`.trim()).join("; ")}` : ""}`, locator: "DNS" });
  }

  // Screenshots
  if (doc.screenshots.desktop) add({ id: "screenshot.desktop", source: "screenshot", excerpt: "Desktop above-the-fold screenshot, 1440x900", screenshotKey: doc.screenshots.desktop, locator: "viewport" });
  if (doc.screenshots.mobile) add({ id: "screenshot.mobile", source: "screenshot", excerpt: "Mobile above-the-fold screenshot, 390x844", screenshotKey: doc.screenshots.mobile, locator: "viewport" });

  return c;
}
