/**
 * Rule findings: deterministic checks over the evidence, each citing the
 * catalog items it read. Thresholds are published ones (web.dev, Lighthouse)
 * and stated in the finding. No rule guesses; absent data means no finding.
 */
import type { BuildAction, EvidenceDoc, Finding, Technology } from "@red/shared";
import type { Catalog } from "./catalog";

export interface RuleFinding {
  ruleId: string;
  category: Finding["category"];
  severity: Finding["severity"];
  title: string;
  summary: string;
  kind: "detected" | "inferred" | "risk";
  score: number;
  rationale: string;
  evidenceIds: string[];
  actions: Omit<BuildAction, "id">[];
}

type Stack = { has: (id: string) => boolean };

function headerSnippet(stack: Stack, headers: [string, string][]): { language: string; source: string } {
  if (stack.has("nextjs")) {
    return {
      language: "js",
      source: `// next.config.js\nmodule.exports = {\n  async headers() {\n    return [{\n      source: "/(.*)",\n      headers: [\n${headers.map(([k, v]) => `        { key: "${k}", value: "${v}" },`).join("\n")}\n      ],\n    }];\n  },\n};`,
    };
  }
  if (stack.has("vercel")) {
    return { language: "json", source: JSON.stringify({ headers: [{ source: "/(.*)", headers: headers.map(([key, value]) => ({ key, value })) }] }, null, 2) };
  }
  if (stack.has("netlify")) return { language: "text", source: `# public/_headers\n/*\n${headers.map(([k, v]) => `  ${k}: ${v}`).join("\n")}` };
  if (stack.has("apache")) return { language: "apache", source: `# .htaccess\n<IfModule mod_headers.c>\n${headers.map(([k, v]) => `  Header always set ${k} "${v}"`).join("\n")}\n</IfModule>` };
  if (stack.has("wordpress")) {
    return { language: "php", source: `// functions.php\nadd_action('send_headers', function () {\n${headers.map(([k, v]) => `  header("${k}: ${v.replace(/"/g, '\\"')}");`).join("\n")}\n});` };
  }
  if (stack.has("cloudflare")) return { language: "text", source: `Cloudflare dashboard -> Rules -> Transform Rules -> Modify Response Header:\n${headers.map(([k, v]) => `  Set static  ${k} = ${v}`).join("\n")}` };
  return { language: "nginx", source: headers.map(([k, v]) => `add_header ${k} "${v}" always;`).join("\n") };
}

const has = (cat: Catalog, ...ids: string[]) => ids.every((id) => cat.has(id));
const fmtMs = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

export function runRules(doc: EvidenceDoc, cat: Catalog, tech: Technology[], unavailable: ReadonlySet<string> = new Set()): RuleFinding[] {
  const out: RuleFinding[] = [];
  const stackIds = new Set(tech.map((t) => t.id));
  const stack: Stack = { has: (id) => stackIds.has(id) };
  const d = doc.passes.desktop;
  const m = doc.passes.mobile;
  const sec = d.document.security;
  const https = d.navigation.finalUrl.startsWith("https://");
  const lh = doc.lighthouse;
  const audit = (id: string) => lh.audits.find((a) => a.id === id);
  const push = (f: RuleFinding) => {
    const ids = f.evidenceIds.filter((id) => cat.has(id));
    if (ids.length) out.push({ ...f, evidenceIds: [...new Set(ids)] });
  };

  // ---------------- security ----------------
  if (https && !sec["strict-transport-security"]) {
    push({
      ruleId: "security.hsts-missing", category: "security", severity: "medium", kind: "risk", score: 95,
      title: "No HSTS header, so first visits can be downgraded to HTTP",
      summary: "The document response has no Strict-Transport-Security header. Browsers will not remember to use HTTPS, which leaves the first request of each visit open to SSL-stripping on hostile networks.",
      rationale: "Header absence read directly from the document response.",
      evidenceIds: ["hdr-missing.strict-transport-security", "nav.final"],
      actions: [{ title: "Send Strict-Transport-Security", effort: "minutes", instruction: "Add the header to every HTTPS response. Start with a short max-age, confirm nothing breaks over HTTP, then raise it to two years and consider preload.", code: headerSnippet(stack, [["Strict-Transport-Security", "max-age=63072000; includeSubDomains"]]) }],
    });
  }
  if (!sec["content-security-policy"]) {
    push({
      ruleId: "security.csp-missing", category: "security", severity: sec["content-security-policy-report-only"] ? "low" : "medium", kind: "risk", score: 92,
      title: sec["content-security-policy-report-only"] ? "CSP runs in report-only mode and blocks nothing" : "No Content-Security-Policy",
      summary: sec["content-security-policy-report-only"] ? "A Content-Security-Policy-Report-Only header is sent, but no enforcing policy. Injected scripts would still run." : "The document has no Content-Security-Policy header, so an injected script (XSS, a compromised third party) runs with full page access.",
      rationale: "Header absence read directly from the document response.",
      evidenceIds: ["hdr-missing.content-security-policy", "hdr.content-security-policy-report-only", "assets.scripts"],
      actions: [{ title: "Ship a CSP in report-only first, then enforce", effort: "hours", instruction: "List the script, style, image, and connect origins the page actually loads (the third-party list on this scan is a starting point), send them as Content-Security-Policy-Report-Only with a report endpoint for a week, fix violations, then switch to the enforcing header.", code: headerSnippet(stack, [["Content-Security-Policy-Report-Only", "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"]]) }],
    });
  }
  const csp = d.document.headers.find((h) => h.name === "content-security-policy")?.value ?? "";
  if (!sec["x-frame-options"] && !/frame-ancestors/i.test(csp)) {
    push({
      ruleId: "security.clickjacking", category: "security", severity: "low", kind: "risk", score: 90,
      title: "Page can be framed by any site (clickjacking)",
      summary: "Neither X-Frame-Options nor a CSP frame-ancestors directive is sent, so another origin can embed this page in an iframe.",
      rationale: "Both protections are absent from the document headers.",
      evidenceIds: ["hdr-missing.x-frame-options", "hdr.content-security-policy", "hdr-missing.content-security-policy"],
      actions: [{ title: "Forbid cross-origin framing", effort: "minutes", instruction: "Send frame-ancestors in your CSP (preferred) or X-Frame-Options: SAMEORIGIN.", code: headerSnippet(stack, [["X-Frame-Options", "SAMEORIGIN"]]) }],
    });
  }
  if (!sec["x-content-type-options"]) {
    push({
      ruleId: "security.nosniff-missing", category: "security", severity: "low", kind: "risk", score: 90,
      title: "No X-Content-Type-Options: nosniff",
      summary: "Without nosniff, browsers may MIME-sniff responses and execute content served with the wrong type.",
      rationale: "Header absence read directly.",
      evidenceIds: ["hdr-missing.x-content-type-options"],
      actions: [{ title: "Send nosniff", effort: "minutes", instruction: "Add X-Content-Type-Options: nosniff to all responses.", code: headerSnippet(stack, [["X-Content-Type-Options", "nosniff"]]) }],
    });
  }
  const leaky = ["server", "x-powered-by", "x-aspnet-version", "x-generator"]
    .map((n) => d.document.headers.find((h) => h.name === n))
    .filter((h): h is { name: string; value: string } => !!h && /\d+\.\d+/.test(h.value));
  if (leaky.length) {
    push({
      ruleId: "security.version-disclosure", category: "security", severity: "low", kind: "risk", score: 88,
      title: "Server software versions are disclosed in headers",
      summary: `Response headers name exact software versions (${leaky.map((h) => `${h.name}: ${h.value}`).join("; ")}), which makes matching known vulnerabilities trivial.`,
      rationale: "Version strings read directly from response headers.",
      evidenceIds: leaky.map((h) => `hdr.${h.name}`),
      actions: [{ title: "Remove version strings from response headers", effort: "minutes", instruction: stack.has("nginx") ? "Set server_tokens off; in nginx and drop X-Powered-By at the app or proxy." : "Turn off version banners in the web server and remove X-Powered-By in the app or at the proxy." }],
    });
  }
  const insecure = https && !unavailable.has("cookies") ? d.cookies.filter((c) => !c.secure && !c.thirdParty) : [];
  if (insecure.length) {
    push({
      ruleId: "security.cookie-not-secure", category: "security", severity: "medium", kind: "risk", score: 90,
      title: `${insecure.length} first-party cookie${insecure.length === 1 ? " is" : "s are"} set without Secure`,
      summary: `On an HTTPS site, ${insecure.map((c) => c.name).slice(0, 6).join(", ")} ${insecure.length === 1 ? "lacks" : "lack"} the Secure flag and can be sent over plain HTTP. Values were not recorded.`,
      rationale: "Cookie flags read from the browser's cookie jar after load.",
      evidenceIds: insecure.slice(0, 6).map((c) => `cookie.${c.name}@${c.domain}`),
      actions: [{ title: "Set Secure (and SameSite) on every cookie", effort: "hours", instruction: "Find where each cookie is set (server Set-Cookie or a script such as an analytics tag) and add Secure; SameSite=Lax. For analytics cookies, use the vendor's cookie_flags setting.", code: stack.has("vendor.google-analytics.com") || insecure.some((c) => c.name.startsWith("_ga")) ? { language: "js", source: "gtag('config', 'G-XXXXXXX', { cookie_flags: 'SameSite=Lax;Secure' });" } : undefined }],
    });
  }
  const publicMaps = doc.sourceMaps.fetched.map((f, i) => ({ f, i })).filter(({ f }) => !f.skipped && f.status != null && f.status < 400 && f.sourcesCount > 0);
  if (publicMaps.length) {
    push({
      ruleId: "security.public-source-maps", category: "security", severity: "low", kind: "risk", score: 85,
      title: "Production source maps are publicly downloadable",
      summary: `${publicMaps.length} source map${publicMaps.length === 1 ? " is" : "s are"} served publicly and list original source paths. Anyone can rebuild readable source, including comments and internal paths.`,
      rationale: "Maps referenced by the page were fetched (robots.txt permitting) and parsed; only file names were kept.",
      evidenceIds: publicMaps.map(({ i }) => `sm.map.${i}`),
      actions: [{ title: "Stop serving source maps publicly", effort: "minutes", instruction: "Upload maps to your error tracker instead of deploying them, or block *.map at the edge.", code: stack.has("nextjs") ? { language: "js", source: "// next.config.js\nmodule.exports = { productionBrowserSourceMaps: false };" } : undefined }],
    });
  }
  if (doc.tls?.validTo) {
    const days = Math.floor((Date.parse(doc.tls.validTo) - Date.parse(doc.collectedAt)) / 86_400_000);
    if (Number.isFinite(days) && days < 21) {
      push({
        ruleId: "security.cert-expiring", category: "security", severity: days < 7 ? "high" : "medium", kind: "risk", score: 97,
        title: `TLS certificate expires in ${days} day${days === 1 ? "" : "s"}`,
        summary: `The certificate is valid until ${doc.tls.validTo.slice(0, 10)}. If renewal fails, every visitor gets a browser security error.`,
        rationale: "Expiry read from the TLS handshake.",
        evidenceIds: ["tls"],
        actions: [{ title: "Confirm automatic renewal", effort: "minutes", instruction: "Check your certificate automation (ACME client, host, or CDN) and renew now if it is not scheduled." }],
      });
    }
  }
  if (!doc.wellKnown.find((w) => w.path === "/.well-known/security.txt")?.exists) {
    push({
      ruleId: "security.no-security-txt", category: "security", severity: "info", kind: "detected", score: 95,
      title: "No security.txt for vulnerability reports",
      summary: "/.well-known/security.txt is missing, so researchers have no published way to report a vulnerability.",
      rationale: "The file was requested directly and not found.",
      evidenceIds: ["wk..well-known/security.txt"],
      actions: [{ title: "Publish security.txt", effort: "minutes", instruction: "Serve /.well-known/security.txt with a Contact and an Expires line (RFC 9116).", code: { language: "text", source: `Contact: mailto:security@${new URL(d.navigation.finalUrl).hostname}\nExpires: ${new Date(Date.parse(doc.collectedAt) + 365 * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z\nPreferred-Languages: en` } }],
    });
  }

  // ---------------- performance ----------------
  for (const [pass, p] of [["mobile", m], ["desktop", d]] as const) {
    if (!p) continue;
    const lcp = p.vitals.lcpMs;
    if (lcp != null && lcp > 2500) {
      push({
        ruleId: `performance.lcp-${pass}`, category: "performance", severity: lcp > 4000 ? "high" : "medium", kind: "detected", score: 80,
        title: `Largest Contentful Paint is ${fmtMs(lcp)} on ${pass}`,
        summary: `One lab load measured LCP at ${lcp} ms (${pass}); web.dev rates above 2500 ms as ${lcp > 4000 ? "poor" : "needs improvement"}. Field data can differ.`,
        rationale: "Measured once in a lab browser with PerformanceObserver; a single load, so treat as indicative.",
        evidenceIds: [`vital.${pass}.lcp`, "lh.largest-contentful-paint", "lh.render-blocking-resources", "lh.server-response-time"],
        actions: [{ title: "Make the LCP element load first", effort: "hours", instruction: "Identify the LCP element (hero image or headline), serve it from the HTML (not client JS), preload it, size it with width/height, and remove render-blocking CSS/JS ahead of it.", code: stack.has("nextjs") ? { language: "tsx", source: 'import Image from "next/image";\n\n<Image src="/hero.jpg" alt="…" width={1440} height={720} priority />' } : { language: "html", source: '<link rel="preload" as="image" href="/hero.jpg" fetchpriority="high">' } }],
      });
      break; // one LCP finding, mobile first
    }
  }
  const cls = m?.vitals.cls ?? d.vitals.cls;
  const clsPass = m?.vitals.cls != null ? "mobile" : "desktop";
  if (cls != null && cls > 0.1) {
    push({
      ruleId: "performance.cls", category: "performance", severity: cls > 0.25 ? "high" : "medium", kind: "detected", score: 80,
      title: `Layout shifts during load (CLS ${cls})`,
      summary: `Cumulative Layout Shift measured ${cls} on ${clsPass}; above 0.1 content visibly jumps while people read or tap.`,
      rationale: "Measured with PerformanceObserver during one lab load.",
      evidenceIds: [`vital.${clsPass}.cls`, "lh.cumulative-layout-shift"],
      actions: [{ title: "Reserve space for late content", effort: "hours", instruction: "Give images, embeds, and ad slots explicit width/height or aspect-ratio, avoid inserting banners above existing content, and use font-display with size-adjusted fallbacks." }],
    });
  }
  const ttfb = d.navigation.timing.ttfbMs;
  if (ttfb != null && ttfb > 800) {
    push({
      ruleId: "performance.ttfb", category: "performance", severity: ttfb > 1800 ? "high" : "medium", kind: "detected", score: 75,
      title: `Server responds slowly (TTFB ${fmtMs(ttfb)})`,
      summary: `Time to first byte was ${ttfb} ms on the desktop load; web.dev recommends 800 ms or less. Everything else waits on it.`,
      rationale: "Navigation Timing from one load; network distance from the scanner adds to it.",
      evidenceIds: ["nav.final", "lh.server-response-time", "hdr.cache-control", "hdr.age"],
      actions: [{ title: "Cache the HTML at the edge", effort: "hours", instruction: "Serve the page statically or with stale-while-revalidate from a CDN, and profile the slowest server work for uncached requests." }],
    });
  }
  if (lh.status === "ok" && lh.scores.performance != null && lh.scores.performance < 90) {
    const failing = ["render-blocking-resources", "unused-javascript", "unused-css-rules", "uses-optimized-images", "modern-image-formats", "uses-text-compression", "uses-long-cache-ttl", "bootup-time", "mainthread-work-breakdown", "total-byte-weight"]
      .map((id) => audit(id))
      .filter((a): a is NonNullable<typeof a> => !!a && a.score != null && a.score < 0.9);
    push({
      ruleId: "performance.lighthouse", category: "performance", severity: lh.scores.performance < 50 ? "high" : "medium", kind: "detected", score: 85,
      title: `Lighthouse performance score ${lh.scores.performance}/100 (mobile)`,
      summary: failing.length ? `Lighthouse flags: ${failing.map((a) => `${a.title}${a.displayValue ? ` (${a.displayValue})` : ""}`).join("; ")}.` : "Lighthouse scored performance below 90 on its mobile profile.",
      rationale: "Lighthouse run on the scanner's Chrome with its default simulated mobile throttling.",
      evidenceIds: ["lh.score.performance", ...failing.map((a) => `lh.${a.id}`)],
      actions: failing.slice(0, 3).map((a) => ({ title: `Fix: ${a.title}`, effort: "hours" as const, instruction: `Lighthouse audit "${a.id}"${a.displayValue ? ` reports ${a.displayValue}` : ""}. Address the listed resources first; re-scan to confirm the score moves.` })),
    });
  }
  const blocking = unavailable.has("assets") ? [] : d.assets.scripts.filter((s) => !s.async && !s.defer && !s.module);
  if (blocking.length >= 3) {
    push({
      ruleId: "performance.sync-scripts", category: "performance", severity: "low", kind: "detected", score: 80,
      title: `${blocking.length} external scripts load without async or defer`,
      summary: `${blocking.length} of ${d.assets.scripts.length} external scripts have no async, defer, or type=module. In the head they block rendering until downloaded and run.`,
      rationale: "Script attributes read from the rendered DOM; placement in head vs body was not recorded.",
      evidenceIds: ["assets.scripts", ...blocking.slice(0, 6).map((_, i) => `script.sync.${i}`), "lh.render-blocking-resources"],
      actions: [{ title: "Defer non-critical scripts", effort: "hours", instruction: "Add defer to scripts that do not need to run before first paint, and load third-party tags after load.", code: { language: "html", source: '<script src="/app.js" defer></script>' } }],
    });
  }
  const tpBytes = doc.thirdParties.reduce((n, t) => n + t.transferBytes, 0);
  if (d.network.transferBytes > 0 && tpBytes / d.network.transferBytes > 0.35 && tpBytes > 200 * 1024) {
    const top = doc.thirdParties.slice().sort((a, b) => b.transferBytes - a.transferBytes).slice(0, 5);
    push({
      ruleId: "performance.third-party-weight", category: "performance", severity: "medium", kind: "detected", score: 85,
      title: `Third parties are ${Math.round((tpBytes / d.network.transferBytes) * 100)}% of bytes transferred`,
      summary: `${(tpBytes / 1024).toFixed(0)} KB of ${(d.network.transferBytes / 1024).toFixed(0)} KB came from ${doc.thirdParties.length} third-party domains; heaviest: ${top.map((t) => t.vendor ?? t.domain).join(", ")}.`,
      rationale: "Byte counts from the desktop network log.",
      evidenceIds: ["net.totals", ...top.map((t) => `tp.${t.domain}`)],
      actions: [{ title: "Audit and lazy-load third-party tags", effort: "hours", instruction: "Remove tags nobody uses, load chat and video embeds on interaction (facade pattern), and move analytics to after load." }],
    });
  }
  if (d.network.transferBytes > 4 * 1024 * 1024) {
    push({
      ruleId: "performance.page-weight", category: "performance", severity: "medium", kind: "detected", score: 90,
      title: `Page transfers ${(d.network.transferBytes / 1024 / 1024).toFixed(1)} MB on first load`,
      summary: `The desktop load transferred ${(d.network.transferBytes / 1024).toFixed(0)} KB across ${d.network.totalRequests} requests. On mobile data that is slow and costly.`,
      rationale: "Sum of encoded bytes in the network log.",
      evidenceIds: ["net.totals", "lh.total-byte-weight"],
      actions: [{ title: "Cut the largest transfers", effort: "hours", instruction: "Start with the largest requests in the waterfall: compress and resize images (AVIF/WebP), split JavaScript by route, and lazy-load below-the-fold media." }],
    });
  }

  // ---------------- SEO ----------------
  const head = d.head;
  const headOk = !unavailable.has("head");
  if (headOk && !head.title) push({ ruleId: "seo.no-title", category: "seo", severity: "high", kind: "detected", score: 97, title: "The page has no <title>", summary: "Search results and browser tabs fall back to the URL.", rationale: "Read from the rendered head.", evidenceIds: ["meta.title"], actions: [{ title: "Add a descriptive title", effort: "minutes", instruction: "Write a unique 50 to 60 character title naming the page and brand." }] });
  if (headOk) if (!head.description) push({ ruleId: "seo.no-description", category: "seo", severity: "medium", kind: "detected", score: 97, title: "No meta description", summary: "Search engines will pick their own snippet text from the page.", rationale: "Read from the rendered head.", evidenceIds: ["meta.description", "lh.meta-description"], actions: [{ title: "Write a meta description", effort: "minutes", instruction: "Add a 140 to 160 character summary that says what the page offers.", code: { language: "html", source: '<meta name="description" content="…">' } }] });
  if (headOk) if (!head.canonical) push({ ruleId: "seo.no-canonical", category: "seo", severity: "low", kind: "detected", score: 95, title: "No canonical URL", summary: "Without rel=canonical, query-string and trailing-slash variants can compete as duplicates.", rationale: "Read from the rendered head.", evidenceIds: ["meta.canonical"], actions: [{ title: "Declare the canonical URL", effort: "minutes", instruction: "Add a self-referencing canonical on every page.", code: { language: "html", source: `<link rel="canonical" href="${d.navigation.finalUrl}">` } }] });
  if (headOk) if (!head.og["image"] || !head.og["title"]) push({ ruleId: "seo.og-incomplete", category: "seo", severity: "low", kind: "detected", score: 95, title: "Link previews are incomplete (Open Graph)", summary: `Shared links lack ${[!head.og["title"] && "og:title", !head.og["image"] && "og:image"].filter(Boolean).join(" and ")}, so social and chat previews show little or nothing.`, rationale: "Read from the rendered head.", evidenceIds: ["meta.og"], actions: [{ title: "Add og:title, og:description, og:image", effort: "minutes", instruction: "Use a 1200x630 image and the page's own title and description." }] });
  if (headOk) if (head.robots && /noindex/i.test(head.robots)) push({ ruleId: "seo.noindex", category: "seo", severity: "high", kind: "detected", score: 97, title: "The page tells search engines not to index it", summary: `<meta name="robots" content="${head.robots}"> keeps this page out of search results.`, rationale: "Read from the rendered head.", evidenceIds: ["meta.robots"], actions: [{ title: "Remove noindex if this page should rank", effort: "minutes", instruction: "Delete the noindex directive (and check X-Robots-Tag headers) on pages meant to be found." }] });
  if (!doc.wellKnown.find((w) => w.path === "/sitemap.xml")?.exists) push({ ruleId: "seo.no-sitemap", category: "seo", severity: "low", kind: "detected", score: 85, title: "No /sitemap.xml", summary: "No sitemap at the conventional path (one may be declared elsewhere in robots.txt).", rationale: "The file was requested directly.", evidenceIds: ["wk.sitemap.xml", "wk.robots.txt"], actions: [{ title: "Publish a sitemap", effort: "minutes", instruction: "Generate sitemap.xml from your routes and reference it from robots.txt." }] });
  if (headOk) if (!head.lang) push({ ruleId: "accessibility.no-lang", category: "accessibility", severity: "medium", kind: "detected", score: 97, title: "<html> has no lang attribute", summary: "Screen readers guess the language and may mispronounce everything.", rationale: "Read from the rendered DOM.", evidenceIds: ["meta.lang"], actions: [{ title: "Set the document language", effort: "minutes", instruction: "Add lang to the html element.", code: { language: "html", source: '<html lang="en">' } }] });

  // ---------------- accessibility / quality ----------------
  if (lh.status === "ok" && lh.scores.accessibility != null && lh.scores.accessibility < 90) {
    const a11y = ["color-contrast", "image-alt"].map((id) => audit(id)).filter((a): a is NonNullable<typeof a> => !!a && a.score === 0);
    push({ ruleId: "accessibility.lighthouse", category: "accessibility", severity: lh.scores.accessibility < 70 ? "high" : "medium", kind: "detected", score: 85, title: `Lighthouse accessibility score ${lh.scores.accessibility}/100`, summary: a11y.length ? `Failing audits include: ${a11y.map((a) => a.title).join("; ")}.` : "Lighthouse found accessibility failures on the mobile profile.", rationale: "Automated audits catch only part of accessibility issues.", evidenceIds: ["lh.score.accessibility", ...a11y.map((a) => `lh.${a.id}`)], actions: [{ title: "Fix the failing accessibility audits", effort: "hours", instruction: "Start with contrast and missing alt text; then test with a screen reader and keyboard only." }] });
  }
  if (lh.status === "ok" && lh.scores.seo != null && lh.scores.seo < 90) {
    push({ ruleId: "seo.lighthouse", category: "seo", severity: "low", kind: "detected", score: 85, title: `Lighthouse SEO score ${lh.scores.seo}/100`, summary: "Lighthouse's SEO checks found basic issues on the mobile profile.", rationale: "Lighthouse run on the scanner's Chrome.", evidenceIds: ["lh.score.seo", "lh.is-crawlable", "lh.document-title", "lh.meta-description"], actions: [{ title: "Clear the Lighthouse SEO audits", effort: "minutes", instruction: "Fix each failing SEO audit in Lighthouse's report and re-scan." }] });
  }
  if (d.console.errors.length) {
    push({ ruleId: "content.console-errors", category: "content", severity: d.console.errors.length >= 5 ? "medium" : "low", kind: "detected", score: 95, title: `${d.console.errors.length} JavaScript console error${d.console.errors.length === 1 ? "" : "s"} on load`, summary: `The page logged errors while loading, starting with: ${d.console.errors[0]!.text.slice(0, 160)}`, rationale: "Captured from the browser console during the desktop load.", evidenceIds: d.console.errors.slice(0, 5).map((_, i) => `console.${i}`), actions: [{ title: "Fix the errors logged on load", effort: "hours", instruction: "Reproduce in DevTools with the same URL; errors on load often mean a broken feature for some visitors." }] });
  }
  const failed = d.network.entries.map((e, i) => ({ e, i })).filter(({ e }) => (e.status ?? 0) >= 400 && e.party === "first");
  if (failed.length) {
    push({ ruleId: "content.broken-requests", category: "content", severity: "low", kind: "detected", score: 95, title: `${failed.length} first-party request${failed.length === 1 ? "" : "s"} returned an error`, summary: `For example ${failed[0]!.e.url} answered HTTP ${failed[0]!.e.status}.`, rationale: "Status codes from the network log.", evidenceIds: failed.slice(0, 5).map(({ i }) => `net.${i}`), actions: [{ title: "Fix or remove broken asset references", effort: "minutes", instruction: "Update or delete references to the failing URLs." }] });
  }
  if (lh.status !== "ok") {
    push({ ruleId: "performance.lighthouse-missing", category: "performance", severity: "info", kind: "detected", score: 99, title: "Lighthouse did not complete for this scan", summary: `No Lighthouse scores: ${lh.reason ?? lh.status}. Lab vitals from the page load are still reported.`, rationale: "Recorded by the scanner.", evidenceIds: ["lh.status"], actions: [] });
  }
  return out;
}
