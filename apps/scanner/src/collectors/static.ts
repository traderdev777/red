/**
 * Lite collection: reads what a plain HTTP fetch of the document shows,
 * without running the page. Used where no local Chrome is available
 * (SCANNER_MODE=lite). Everything here is parsed from the served HTML and
 * headers, so client-rendered content is invisible to it; the evidence says so.
 */
import { parse, type HTMLElement } from "node-html-parser";
import type { RawHead } from "./html";
import type { RawAssets } from "./assets";
import type { RawCookie } from "./cookies";
import { RUNTIME_PROBES } from "./runtime";

export function parseDocument(html: string): HTMLElement {
  return parse(html, { lowerCaseTagName: true, comment: false, blockTextElements: { script: true, style: true, noscript: false, pre: true } });
}

export function staticHead(root: HTMLElement): RawHead {
  const meta = root
    .querySelectorAll("meta")
    .slice(0, 300)
    .map((m) => ({
      name: m.getAttribute("name") ?? null,
      property: m.getAttribute("property") ?? null,
      httpEquiv: m.getAttribute("http-equiv") ?? null,
      content: m.getAttribute("content") ?? null,
    }));
  const links = root
    .querySelectorAll("link")
    .filter((l) => l.getAttribute("rel") && l.getAttribute("href"))
    .slice(0, 300)
    .map((l) => ({ rel: l.getAttribute("rel") ?? "", href: l.getAttribute("href") ?? "" }));
  const jsonLd = root
    .querySelectorAll("script")
    .filter((s) => (s.getAttribute("type") ?? "").toLowerCase() === "application/ld+json")
    .slice(0, 20)
    .map((s) => s.rawText);
  const title = root.querySelector("title")?.text ?? null;
  const lang = root.querySelector("html")?.getAttribute("lang") ?? null;
  return { title: title || null, lang, meta, links, jsonLd };
}

const abs = (u: string, base: string) => {
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
};

export function staticAssets(root: HTMLElement, baseUrl: string): RawAssets {
  const scripts = root
    .querySelectorAll("script")
    .slice(0, 600)
    .map((s) => {
      const src = s.getAttribute("src");
      return {
        src: src ? abs(src, baseUrl) : null,
        async: s.hasAttribute("async"),
        defer: s.hasAttribute("defer"),
        type: s.getAttribute("type") ?? null,
        inlineBytes: src ? 0 : Buffer.byteLength(s.rawText),
      };
    });
  const styles = [
    ...root
      .querySelectorAll("link")
      .filter((l) => (l.getAttribute("rel") ?? "").toLowerCase().split(/\s+/).includes("stylesheet") && l.getAttribute("href"))
      .map((l) => ({ href: abs(l.getAttribute("href")!, baseUrl), media: l.getAttribute("media") ?? null, inlineBytes: 0 })),
    ...root.querySelectorAll("style").map((s) => ({ href: null, media: s.getAttribute("media") ?? null, inlineBytes: Buffer.byteLength(s.rawText) })),
  ].slice(0, 600);
  return { scripts, styles };
}

/**
 * The same allowlisted globals as the browser probe, judged from markup and
 * inline script text. A key is true only when the served HTML carries a
 * marker that the framework or tag itself writes.
 */
const STATIC_MARKERS: Partial<Record<keyof typeof RUNTIME_PROBES, (h: string, root: HTMLElement) => boolean>> = {
  __NEXT_DATA__: (_h, r) => !!r.querySelector("#__NEXT_DATA__"),
  next_app_router: (h) => /self\.__next_f\s*=|self\.__next_f\.push/.test(h),
  __NUXT__: (h, r) => !!r.querySelector("#__NUXT_DATA__") || /window\.__NUXT__\s*=/.test(h),
  ng_version: (_h, r) => !!r.querySelector("[ng-version]"),
  react_root: (_h, r) => !!r.querySelector("[data-reactroot]"),
  vue: (_h, r) => !!r.querySelector("[data-v-app]") || !!r.querySelector("[data-server-rendered]"),
  svelte: (h) => /class="[^"]*\bsvelte-[a-z0-9]{4,}/.test(h),
  sveltekit: (h, r) => !!r.querySelector("[data-sveltekit-preload-data]") || !!r.querySelector("[data-sveltekit-reload]") || /__sveltekit_/.test(h),
  astro: (_h, r) => !!r.querySelector("astro-island") || !!r.querySelector("[data-astro-cid]"),
  remix: (h) => /window\.__remixContext\s*=/.test(h),
  gatsby: (_h, r) => !!r.querySelector("#___gatsby"),
  Shopify: (h) => /\bShopify\.(shop|theme|locale)\s*=|cdn\.shopify\.com/.test(h),
  wp: (h) => /\/wp-content\/|\/wp-includes\//.test(h),
  wix: (h) => /static\.parastorage\.com|wixBiSession/.test(h),
  squarespace: (h) => /SQUARESPACE_CONTEXT|static1\.squarespace\.com/.test(h),
  webflow: (h, r) => !!r.querySelector("html[data-wf-site]") || /webflow\.js|assets\.website-files\.com/.test(h),
  framer: (_h, r) => !!r.querySelector("[data-framer-hydrate-v2]") || !!r.querySelector("#__framer-badge-container"),
  gtag: (h) => /function gtag\(|googletagmanager\.com\/gtag\/js/.test(h),
  dataLayer: (h) => /window\.dataLayer\s*=|dataLayer\s*=\s*window\.dataLayer/.test(h),
  fbq: (h) => /fbq\(['"]init['"]|connect\.facebook\.net\/[^"']*\/fbevents\.js/.test(h),
  hj: (h) => /static\.hotjar\.com|window\.hj\s*=/.test(h),
  Intercom: (h) => /widget\.intercom\.io|window\.Intercom\b/.test(h),
  Stripe: (h) => /js\.stripe\.com\/v3/.test(h),
  Sentry: (h) => /browser\.sentry-cdn\.com|Sentry\.init\(/.test(h),
  turbo: (h) => /@hotwired\/turbo|data-turbo-track/.test(h),
  htmx: (h) => /htmx\.org|unpkg\.com\/htmx/.test(h),
  alpine: (h, r) => !!r.querySelector("[x-data]") && /alpinejs/.test(h),
  jquery: (h) => /jquery(\.min)?\.js|jquery-\d/.test(h),
  ember: (h) => /ember(\.min)?\.js|<meta name="[^"]*\/config\/environment"/.test(h),
};

export function staticGlobals(html: string, root: HTMLElement): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(RUNTIME_PROBES)) {
    const test = STATIC_MARKERS[key as keyof typeof RUNTIME_PROBES];
    let v = false;
    try {
      v = test ? test(html, root) : false;
    } catch {
      v = false;
    }
    out[key] = v;
  }
  return out;
}

/** Set-Cookie headers of the document response, names and flags only. */
export function parseSetCookies(lines: string[], host: string): RawCookie[] {
  return lines.slice(0, 200).flatMap((line) => {
    const [pair, ...attrs] = line.split(";");
    const eq = pair?.indexOf("=") ?? -1;
    if (!pair || eq <= 0) return [];
    const name = pair.slice(0, eq).trim();
    let domain = host;
    let path = "/";
    let expires = -1;
    let httpOnly = false;
    let secure = false;
    let sameSite: RawCookie["sameSite"];
    for (const a of attrs) {
      const [k, ...rest] = a.split("=");
      const key = (k ?? "").trim().toLowerCase();
      const val = rest.join("=").trim();
      if (key === "domain" && val) domain = val;
      else if (key === "path" && val) path = val;
      else if (key === "max-age" && /^-?\d+$/.test(val)) expires = Math.floor(Date.now() / 1000) + Number(val);
      else if (key === "expires" && expires === -1) {
        const t = Date.parse(val);
        if (!Number.isNaN(t)) expires = Math.floor(t / 1000);
      } else if (key === "httponly") httpOnly = true;
      else if (key === "secure") secure = true;
      else if (key === "samesite") {
        const s = val.toLowerCase();
        sameSite = s === "strict" ? "Strict" : s === "lax" ? "Lax" : s === "none" ? "None" : undefined;
      }
    }
    return [{ name, domain, path, expires, httpOnly, secure, sameSite }];
  });
}
