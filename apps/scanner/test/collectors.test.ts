/**
 * Collector modules against recorded fixtures (real desktop passes of
 * wordpress.org/news and nextjs.org, recorded with scripts/record-fixture.ts)
 * plus hand-written edge cases.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVIDENCE_LIMITS, EvidenceDocSchema, CookieSchema, type EvidenceDoc } from "@red/shared";
import type { RawPass } from "../src/collectors/pass";
import { buildNavigation } from "../src/collectors/navigation";
import { buildDocumentHeaders, redactSetCookie } from "../src/collectors/headers";
import { buildCookies } from "../src/collectors/cookies";
import { buildHead, buildHtml } from "../src/collectors/html";
import { buildAssets } from "../src/collectors/assets";
import { buildNetwork } from "../src/collectors/network";
import { groupThirdParties } from "../src/collectors/thirdParties";
import { buildRuntime, RUNTIME_PROBES } from "../src/collectors/runtime";
import { buildConsole } from "../src/collectors/console";
import { buildVitals } from "../src/collectors/vitals";
import { detectBotWall } from "../src/collectors/botwall";
import { findReferences, summarizeMap } from "../src/collectors/sourcemaps";
import { buildWellKnown } from "../src/collectors/wellKnown";
import { buildTls, parseCymruAsName, parseCymruOrigin } from "../src/collectors/tlsDns";
import { buildLighthouse, skippedLighthouse } from "../src/collectors/lighthouse";
import { isAllowed } from "../src/net/robots";
import { buildPass, enforceSize, summarize } from "../src/pipeline/collect";

const fixture = (name: string): RawPass => JSON.parse(readFileSync(new URL(`./fixtures/${name}.raw.json`, import.meta.url), "utf8"));
const wp = fixture("wordpress-news");
const next = fixture("nextjs");

describe("navigation", () => {
  it("builds final URL, status and timings from a real pass", () => {
    const n = buildNavigation(wp);
    expect(n.finalUrl).toBe("https://wordpress.org/news/");
    expect(n.status).toBe(200);
    expect(n.timing.ttfbMs).toBeGreaterThan(0);
    expect(n.timing.loadMs).toBeGreaterThanOrEqual(n.timing.domContentLoadedMs ?? 0);
  });
  it("keeps redirect hops in order and treats zero timings as missing", () => {
    const n = buildNavigation({
      requestedUrl: "https://a.example",
      finalUrl: "https://www.a.example/",
      status: 200,
      hops: [{ url: "https://a.example/", status: 301, location: "https://www.a.example/" }],
      perf: { responseStart: 0, domContentLoadedEventEnd: 120.4, loadEventEnd: 0 },
    });
    expect(n.redirectChain).toEqual([{ url: "https://a.example/", status: 301, location: "https://www.a.example/" }]);
    expect(n.timing).toEqual({ ttfbMs: null, domContentLoadedMs: 120, loadMs: null });
  });
});

describe("headers", () => {
  it("keeps every header and summarizes security headers (nextjs.org fixture)", () => {
    const h = buildDocumentHeaders(next.headers);
    expect(h.headers.length).toBe(next.headers.length);
    expect(h.security["strict-transport-security"]).toBe(true);
    expect(h.security["content-security-policy"]).toBe(true);
    expect(h.security["cross-origin-embedder-policy"]).toBe(false);
  });
  it("redacts Set-Cookie values but keeps names and attributes", () => {
    expect(redactSetCookie("sid=s3cr3t; Path=/; HttpOnly; Secure\ntheme=dark; Max-Age=60")).toBe(
      "sid=[redacted]; Path=/; HttpOnly; Secure\ntheme=[redacted]; Max-Age=60",
    );
    const h = buildDocumentHeaders([{ name: "Set-Cookie", value: "token=abc.def.ghi; SameSite=Lax" }]);
    expect(JSON.stringify(h)).not.toContain("abc.def.ghi");
  });
});

describe("cookies", () => {
  it("never stores values, and marks third-party cookies", () => {
    const c = buildCookies(
      [
        { name: "sid", value: "SECRET-VALUE", domain: "shop.example.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" },
        { name: "_fbp", value: "fb.1.2", domain: ".facebook.com", path: "/", expires: 1893456000, httpOnly: false, secure: true, sameSite: "None" },
      ],
      "www.example.com",
    );
    expect(JSON.stringify(c)).not.toContain("SECRET-VALUE");
    expect(c[0]).toMatchObject({ name: "sid", expires: null, thirdParty: false });
    expect(c[1]).toMatchObject({ name: "_fbp", thirdParty: true, expires: "2030-01-01T00:00:00.000Z" });
  });
  it("rejects a cookie object that carries a value", () => {
    expect(() => CookieSchema.parse({ name: "a", value: "b", domain: "x", path: "/", expires: null, httpOnly: false, secure: false, sameSite: null, thirdParty: false })).toThrow();
  });
  it("wordpress fixture: GA cookies are recorded by name only", () => {
    const c = buildCookies(wp.cookies, "wordpress.org");
    expect(c.map((x) => x.name)).toContain("_ga");
  });
});

describe("html and head", () => {
  it("reads generator, canonical and OG from the WordPress fixture", () => {
    const h = buildHead(wp.head, wp.finalUrl);
    expect(h.generator).toMatch(/^WordPress/);
    expect(h.title).toBeTruthy();
    expect(Object.keys(h.og).length).toBeGreaterThan(0);
  });
  it("parses JSON-LD types and flags invalid blocks", () => {
    const h = buildHead(
      { title: "t", lang: "en", meta: [], links: [{ rel: "canonical", href: "/x" }], jsonLd: ['{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["WebSite","Thing"]}]}', "{not json"] },
      "https://a.example/page",
    );
    expect(h.canonical).toBe("https://a.example/x");
    expect(h.jsonLd[0]).toMatchObject({ valid: true, types: ["Organization", "WebSite", "Thing"] });
    expect(h.jsonLd[1]).toMatchObject({ valid: false, types: [] });
  });
  it("caps HTML at 2MB and flags truncation", () => {
    const big = "a".repeat(EVIDENCE_LIMITS.htmlBytes + 10);
    const h = buildHtml(big, true);
    expect(h.truncated).toBe(true);
    expect(h.content!.length).toBe(EVIDENCE_LIMITS.htmlBytes);
    expect(buildHtml(big, false).content).toBeNull();
  });
});

describe("network, assets, third parties", () => {
  const net = buildNetwork(next.network, "nextjs.org");
  it("logs every request with timing, party and cache headers (nextjs fixture)", () => {
    expect(net.totalRequests).toBeGreaterThan(20);
    expect(net.entries[0]).toMatchObject({ resourceType: "document", party: "first", startMs: 0 });
    expect(net.entries.every((e) => e.startMs >= 0)).toBe(true);
    expect(net.transferBytes).toBeGreaterThan(0);
  });
  it("caps the log at 400 entries and flags it", () => {
    const many = Array.from({ length: 450 }, (_, i) => ({ requestId: String(i), url: `https://a.example/${i}.js`, method: "GET", type: "Script", initiator: { type: "parser" }, startTs: i / 1000, endTs: i / 1000 + 0.01, status: 200, encodedDataLength: 10 }));
    const n = buildNetwork(many, "a.example");
    expect(n.entries.length).toBe(400);
    expect(n.totalRequests).toBe(450);
    expect(n.truncated).toBe(true);
    expect(n.transferBytes).toBe(4500);
  });
  it("ignores data: and blob: URLs", () => {
    const n = buildNetwork([{ requestId: "1", url: "data:image/png;base64,AA", method: "GET", type: "Image", initiator: { type: "parser" }, startTs: 1 }], "a.example");
    expect(n.totalRequests).toBe(0);
  });
  it("groups third parties from the shared list (wordpress fixture)", () => {
    const tp = groupThirdParties(buildNetwork(wp.network, "wordpress.org").entries);
    const vendors = tp.map((t) => t.vendor);
    expect(vendors).toContain("Google Tag Manager");
    expect(tp.every((t) => t.domain.length > 0)).toBe(true);
  });
  it("sizes scripts from the network log and counts inline scripts", () => {
    const a = buildAssets(next.assets, net.entries, "nextjs.org");
    expect(a.scripts.length).toBeGreaterThan(0);
    expect(a.scripts.some((s) => s.bytes != null)).toBe(true);
    expect(a.inlineScripts.count).toBeGreaterThan(0);
  });
});

describe("runtime, console, vitals", () => {
  it("returns presence booleans for every allowlisted probe only", () => {
    const r = buildRuntime({ ...next.runtime, injected: "should be dropped", __NEXT_DATA__: "a value" });
    expect(Object.keys(r.globals).sort()).toEqual(Object.keys(RUNTIME_PROBES).sort());
    expect(Object.values(r.globals).every((v) => typeof v === "boolean")).toBe(true);
    expect(r.globals.__NEXT_DATA__).toBe(false); // non-boolean input is not presence
    expect(r.globals.next_app_router).toBe(true);
  });
  it("caps console text", () => {
    const c = buildConsole({ errors: [{ text: "x".repeat(900), url: null }], failedRequests: [] });
    expect(c.errors[0]!.text.length).toBe(500);
  });
  it("computes TBT proxy from long tasks after FCP", () => {
    const v = buildVitals({ lcp: 1200.4, cls: 0.12345, fcp: 500, inp: null, longTasks: [[100, 300], [600, 120], [900, 40]] });
    expect(v).toEqual({ lcpMs: 1200, cls: 0.1235, fcpMs: 500, inpProxyMs: null, tbtProxyMs: 70 });
    expect(buildVitals(null).lcpMs).toBeNull();
  });
});

describe("bot walls", () => {
  it("detects a Cloudflare managed challenge", () => {
    expect(detectBotWall({ status: 403, headers: { "cf-mitigated": "challenge", server: "cloudflare" }, title: "Just a moment...", htmlHead: "" })?.vendor).toBe("cloudflare");
    expect(detectBotWall({ status: 503, headers: { server: "cloudflare" }, title: "Just a moment...", htmlHead: '<script>window._cf_chl_opt={}</script>' })?.vendor).toBe("cloudflare");
  });
  it("detects DataDome and Akamai blocks", () => {
    expect(detectBotWall({ status: 403, headers: { "x-datadome": "protected" }, title: "", htmlHead: "" })?.vendor).toBe("datadome");
    expect(detectBotWall({ status: 403, headers: { server: "AkamaiGHost" }, title: "Access Denied", htmlHead: "Reference #18.abc" })?.vendor).toBe("akamai");
  });
  it("detects a CAPTCHA-only page but not a normal page with a reCAPTCHA form", () => {
    expect(detectBotWall({ status: 403, headers: {}, title: "Security check", htmlHead: '<div class="g-recaptcha"></div><p>Verify you are human</p>' })?.vendor).toBe("captcha");
    expect(detectBotWall({ status: 200, headers: {}, title: "Contact us", htmlHead: '<form><div class="g-recaptcha"></div></form>' })).toBeNull();
  });
  it("does not flag the real fixtures", () => {
    for (const f of [wp, next]) {
      const h = Object.fromEntries(f.headers.map((x) => [x.name.toLowerCase(), x.value]));
      expect(detectBotWall({ status: f.status, headers: h, title: f.head.title, htmlHead: f.html ?? "" })).toBeNull();
    }
  });
});

describe("source maps", () => {
  it("finds references in headers and trailing comments, never fetching data: maps", () => {
    const refs = findReferences([
      { url: "https://a.example/app.js", headers: {}, tail: "console.log(1)\n//# sourceMappingURL=app.js.map" },
      { url: "https://a.example/b.css", headers: { sourcemap: "/maps/b.css.map" }, tail: null },
      { url: "https://a.example/c.js", headers: {}, tail: "x\n//# sourceMappingURL=data:application/json;base64,eyJ9" },
      { url: "https://a.example/d.js", headers: {}, tail: "no map here" },
    ]);
    expect(refs).toEqual([
      { assetUrl: "https://a.example/app.js", mapUrl: "https://a.example/app.js.map", via: "comment" },
      { assetUrl: "https://a.example/b.css", mapUrl: "https://a.example/maps/b.css.map", via: "header" },
      { assetUrl: "https://a.example/c.js", mapUrl: "data:(inline)", via: "comment" },
    ]);
  });
  it("keeps file and sources only, never sourcesContent", () => {
    const s = summarizeMap("https://a.example/app.js.map", 200, JSON.stringify({ version: 3, file: "app.js", sources: ["webpack://src/index.ts"], sourcesContent: ["const SECRET = 1"] }), false, null);
    expect(s).toMatchObject({ file: "app.js", sources: ["webpack://src/index.ts"], sourcesCount: 1 });
    expect(JSON.stringify(s)).not.toContain("SECRET");
  });
  it("robots.txt can disallow fetching a map", () => {
    const robots = "User-agent: *\nDisallow: /static/\nAllow: /static/public/\n\nUser-agent: REDScanner\nDisallow: /private";
    expect(isAllowed(robots, "/static/app.js.map", "googlebot")).toBe(false);
    expect(isAllowed(robots, "/static/public/app.js.map", "googlebot")).toBe(true);
    expect(isAllowed(robots, "/static/app.js.map")).toBe(true); // our own group has no /static rule
    expect(isAllowed(robots, "/private/x.map")).toBe(false);
    expect(isAllowed(null, "/anything")).toBe(true);
  });
});

describe("well-known, TLS, DNS, Lighthouse", () => {
  const res = (status: number, ct: string, body: string) => ({ url: "https://a.example/robots.txt", status, headers: { "content-type": ct }, body: Buffer.from(body), bytes: body.length, truncated: false });
  it("records existence, size and the first 2KB", () => {
    const w = buildWellKnown("/robots.txt", "https://a.example/robots.txt", res(200, "text/plain", `User-agent: *\n${"#".repeat(3000)}`), null);
    expect(w).toMatchObject({ exists: true, bytes: 3014, truncated: true });
    expect(Buffer.byteLength(w.head!)).toBeLessThanOrEqual(2048);
  });
  it("does not count an HTML app shell as the file", () => {
    const w = buildWellKnown("/humans.txt", "https://a.example/humans.txt", res(200, "text/html", "<!doctype html>"), null);
    expect(w.exists).toBe(false);
    expect(w.head).toBeNull();
  });
  it("parses TLS details and Team Cymru answers", () => {
    expect(buildTls({ protocol: "TLS 1.3", issuer: "R11", subjectName: "a.example", validFrom: 1700000000, validTo: 1710000000 })).toEqual({
      protocol: "TLS 1.3",
      issuer: "R11",
      subject: "a.example",
      validFrom: "2023-11-14T22:13:20.000Z",
      validTo: "2024-03-09T16:00:00.000Z",
    });
    expect(parseCymruOrigin("13335 | 104.20.16.0/20 | US | arin | 2014-03-28")).toEqual({ asn: "13335", prefix: "104.20.16.0/20", country: "US" });
    expect(parseCymruAsName("13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US")).toBe("CLOUDFLARENET, US");
  });
  it("maps a Lighthouse report and records a failure honestly", () => {
    const lh = buildLighthouse({
      lighthouseVersion: "12.8.2",
      categories: { performance: { score: 0.66 }, accessibility: { score: 1 }, "best-practices": { score: 0.96 }, seo: { score: null } },
      audits: { "largest-contentful-paint": { title: "Largest Contentful Paint", score: 0.4, displayValue: "3.9 s", numericValue: 3921.5 } },
    });
    expect(lh.scores).toEqual({ performance: 66, accessibility: 100, bestPractices: 96, seo: null });
    expect(lh.audits).toHaveLength(1);
    expect(buildLighthouse({ runtimeError: { code: "NO_FCP", message: "no paint" } }).status).toBe("failed");
    expect(skippedLighthouse("skipped", "budget").scores.performance).toBeNull();
  });
});

describe("evidence document", () => {
  const doc = (): EvidenceDoc => {
    const desktop = buildPass(wp, "wordpress.org", true);
    return EvidenceDocSchema.parse({
      version: 1,
      scanId: "00000000-0000-4000-8000-000000000001",
      requestedUrl: wp.requestedUrl,
      collectedAt: "2026-11-04T05:06:00.000Z",
      durationMs: 24000,
      scanner: { version: "1.0.0", userAgent: "REDScanner/1.0.0 (+https://red.example/bot)" },
      truncated: false,
      truncation: [],
      passes: { desktop, mobile: null },
      mobileError: null,
      thirdParties: groupThirdParties(desktop.network.entries),
      wellKnown: [],
      sourceMaps: { referenced: [], fetched: [] },
      tls: null,
      dns: null,
      lighthouse: skippedLighthouse("skipped", "test"),
      screenshots: { desktop: null, mobile: null },
      blockedRequests: [],
    });
  };
  it("validates a whole document built from a real pass and summarizes it", () => {
    const s = summarize(doc());
    expect(s.finalUrl).toBe("https://wordpress.org/news/");
    expect(s.cookies.count).toBe(2);
    expect(s.thirdParties.top.map((t) => t.name)).toContain("Google Tag Manager");
  });
  it("enforces the 5MB evidence cap by dropping the bulkiest parts, flagged", () => {
    const d = doc();
    d.passes.desktop.html.content = "x".repeat(EVIDENCE_LIMITS.evidenceBytes + 1000);
    const { doc: out, json } = enforceSize(d);
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(EVIDENCE_LIMITS.evidenceBytes);
    expect(out.truncated).toBe(true);
    expect(out.truncation).toContain("passes.desktop.html.content");
  });
  it("contains no cookie values anywhere", () => {
    const json = JSON.stringify(doc());
    for (const c of wp.cookies as { value?: string }[]) if (c.value) expect(json).not.toContain(c.value);
    const d = doc();
    for (const h of d.passes.desktop.document.headers.filter((x) => x.name === "set-cookie")) {
      expect(h.value).toMatch(/^[^=]+=\[redacted\]/);
    }
  });
});
