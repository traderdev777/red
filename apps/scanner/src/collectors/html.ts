import { EVIDENCE_LIMITS, HeadSchema, HtmlSchema, type Head } from "@red/shared";
import { cap, capUrl, truncateBytes } from "./util";
import type { z } from "zod";

export function buildHtml(raw: string | null, keepContent: boolean): z.infer<typeof HtmlSchema> {
  if (raw == null) return { bytes: 0, truncated: false, content: null };
  const t = truncateBytes(raw, EVIDENCE_LIMITS.htmlBytes);
  return HtmlSchema.parse({ bytes: t.bytes, truncated: t.truncated, content: keepContent ? t.text : null });
}

/** What the page script returns: plain strings read from the rendered <head>. */
export interface RawHead {
  title: string | null;
  lang: string | null;
  meta: { name: string | null; property: string | null; httpEquiv: string | null; content: string | null }[];
  links: { rel: string; href: string }[];
  jsonLd: string[];
}

function ldTypes(v: unknown, out: Set<string>, depth = 0) {
  if (depth > 4 || out.size >= 50 || v == null) return;
  if (Array.isArray(v)) return v.forEach((x) => ldTypes(x, out, depth + 1));
  if (typeof v === "object") {
    const t = (v as Record<string, unknown>)["@type"];
    if (typeof t === "string") out.add(t.slice(0, 200));
    if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.add(x.slice(0, 200)));
    const g = (v as Record<string, unknown>)["@graph"];
    if (g) ldTypes(g, out, depth + 1);
  }
}

export function buildHead(raw: RawHead, baseUrl: string): Head {
  const meta = (key: "name" | "property", value: string) =>
    raw.meta.find((m) => (m[key] ?? "").toLowerCase() === value)?.content ?? null;
  const link = (rel: string) => {
    const l = raw.links.find((x) => x.rel.toLowerCase().split(/\s+/).includes(rel));
    if (!l) return null;
    try {
      return capUrl(new URL(l.href, baseUrl).toString());
    } catch {
      return null;
    }
  };
  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  for (const m of raw.meta) {
    const p = (m.property ?? m.name ?? "").toLowerCase();
    if (!m.content) continue;
    if (p.startsWith("og:") && Object.keys(og).length < 40) og[p.slice(3).slice(0, 100)] = m.content.slice(0, 2000);
    if (p.startsWith("twitter:") && Object.keys(twitter).length < 40) twitter[p.slice(8).slice(0, 100)] = m.content.slice(0, 2000);
  }
  const jsonLd = raw.jsonLd.slice(0, 20).map((text) => {
    const t = truncateBytes(text, EVIDENCE_LIMITS.jsonLdBlockBytes);
    const types = new Set<string>();
    let valid = false;
    try {
      ldTypes(JSON.parse(text), types);
      valid = true;
    } catch {
      valid = false;
    }
    return { types: [...types], valid, bytes: t.bytes, truncated: t.truncated, raw: t.text };
  });
  return HeadSchema.parse({
    title: cap(raw.title?.trim() || null, 1000),
    description: cap(meta("name", "description"), 2000),
    canonical: link("canonical"),
    generator: cap(meta("name", "generator"), 500),
    viewport: cap(meta("name", "viewport"), 500),
    themeColor: cap(meta("name", "theme-color"), 200),
    manifest: link("manifest"),
    lang: cap(raw.lang, 50),
    robots: cap(meta("name", "robots"), 500),
    og,
    twitter,
    jsonLd,
  });
}

/** Runs in the page. Reads strings only. */
export const HEAD_PROBE = `(() => {
  const meta = [...document.querySelectorAll('meta')].slice(0, 300).map(m => ({
    name: m.getAttribute('name'), property: m.getAttribute('property'),
    httpEquiv: m.getAttribute('http-equiv'), content: m.getAttribute('content')
  }));
  const links = [...document.querySelectorAll('link[rel][href]')].slice(0, 300).map(l => ({ rel: l.getAttribute('rel') || '', href: l.getAttribute('href') || '' }));
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 20).map(s => s.textContent || '');
  return { title: document.title || null, lang: document.documentElement.getAttribute('lang'), meta, links, jsonLd };
})()`;
