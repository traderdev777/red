import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocument, parseSetCookies, staticAssets, staticGlobals, staticHead } from "../src/collectors/static";
import { consoleFromLhr, networkFromLhr, psiError, psiUrl, screenshotFromLhr, vitalsFromLhr, type Lhr } from "../src/collectors/psi";
import { buildLighthouse } from "../src/collectors/lighthouse";
import { looksClientRendered } from "../src/pipeline/collectLite";

const HTML = `<!doctype html><html lang="en"><head><title>Acme</title>
<meta name="description" content="Tools"><meta property="og:title" content="Acme">
<link rel="canonical" href="/home"><link rel="stylesheet" href="/a.css" media="all">
<script type="application/ld+json">{"@type":"Organization"}</script>
<script src="/_next/static/app.js" async></script><script>self.__next_f.push([1,""])</script>
<style>body{}</style></head><body><div id="__next">Hello world</div>
<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script></body></html>`;

describe("static document reading", () => {
  const root = parseDocument(HTML);
  it("reads the head", () => {
    const h = staticHead(root);
    expect(h.title).toBe("Acme");
    expect(h.lang).toBe("en");
    expect(h.meta.find((m) => m.name === "description")?.content).toBe("Tools");
    expect(h.links.find((l) => l.rel === "canonical")?.href).toBe("/home");
    expect(h.jsonLd).toHaveLength(1);
  });
  it("reads scripts and styles with absolute URLs", () => {
    const a = staticAssets(root, "https://acme.test/x");
    expect(a.scripts.find((s) => s.src?.endsWith("app.js"))).toMatchObject({ src: "https://acme.test/_next/static/app.js", async: true });
    expect(a.styles.find((s) => s.href)).toMatchObject({ href: "https://acme.test/a.css", media: "all" });
    expect(a.styles.some((s) => !s.href && s.inlineBytes > 0)).toBe(true);
  });
  it("marks only globals whose own markers are present", () => {
    const g = staticGlobals(HTML, root);
    expect(g.next_app_router).toBe(true);
    expect(g.gtag).toBe(true);
    expect(g.wp).toBe(false);
    expect(g.jquery).toBe(false);
  });
  it("spots an empty client-rendered shell", () => {
    expect(looksClientRendered(`<html><body><div id="root"></div><script src="/m.js"></script></body></html>`)).toBe(true);
    expect(looksClientRendered(HTML.replace("Hello world", "x ".repeat(200)))).toBe(false);
  });
});

describe("Set-Cookie parsing", () => {
  it("keeps names and flags, never values, and handles Expires commas", () => {
    const c = parseSetCookies(["sid=SECRET; Path=/; Expires=Wed, 21 Oct 2037 07:28:00 GMT; HttpOnly; Secure; SameSite=Lax", "pref=1; Domain=.acme.test; Max-Age=60"], "acme.test");
    expect(c).toHaveLength(2);
    expect(JSON.stringify(c)).not.toContain("SECRET");
    expect(c[0]).toMatchObject({ name: "sid", httpOnly: true, secure: true, sameSite: "Lax", domain: "acme.test" });
    expect(c[0]!.expires).toBe(Math.floor(Date.parse("Wed, 21 Oct 2037 07:28:00 GMT") / 1000));
    expect(c[1]).toMatchObject({ name: "pref", domain: ".acme.test" });
  });
});

describe("PageSpeed Insights result mapping (real Lighthouse 12 result)", () => {
  const lhr = JSON.parse(readFileSync(new URL("./fixtures/lhr-cern-mobile.json", import.meta.url), "utf8")) as Lhr;
  it("builds Lighthouse scores", () => {
    const l = buildLighthouse(lhr);
    expect(l.status).toBe("ok");
    expect(l.scores.performance).toBeGreaterThan(0);
    expect(l.audits.length).toBeGreaterThan(5);
  });
  it("maps the request list, vitals and screenshot", () => {
    const n = networkFromLhr(lhr);
    expect(n[0]).toMatchObject({ url: "https://info.cern.ch/", type: "Document", status: 200 });
    const v = vitalsFromLhr(lhr);
    expect(v.lcpMs).toBeGreaterThan(0);
    expect(v.inpProxyMs).toBeNull();
    expect(screenshotFromLhr(lhr)?.subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(consoleFromLhr(lhr).errors).toBeInstanceOf(Array);
  });
  it("returns nulls without a result", () => {
    expect(vitalsFromLhr(null)).toMatchObject({ lcpMs: null, cls: null });
    expect(screenshotFromLhr(null)).toBeNull();
  });
  it("builds the request and hides the key in errors", () => {
    const u = new URL(psiUrl("https://a.test/", "desktop", "KEY123"));
    expect(u.searchParams.getAll("category")).toEqual(["performance", "accessibility", "best-practices", "seo"]);
    expect(u.searchParams.get("strategy")).toBe("desktop");
    expect(psiError(429, '{"error":{"message":"Quota exceeded for key=KEY123"}}')).toBe("PageSpeed Insights quota reached (HTTP 429): Quota exceeded for key=…");
  });
});
