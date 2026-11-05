/**
 * Fingerprint stage: deterministic technology detection. Each rule names the
 * catalog items it matched; no rule fires without one. The model is not used.
 */
import { TechnologySchema, type EvidenceDoc, type Technology } from "@red/shared";
import type { Catalog } from "./catalog";

interface Signal {
  id: string; // catalog id
  label: string;
  direct: boolean;
}
type Probe = (doc: EvidenceDoc, cat: Catalog) => Signal[];

const header = (doc: EvidenceDoc, name: string) => doc.passes.desktop.document.headers.find((h) => h.name === name)?.value ?? null;
const hasRuntime = (cat: Catalog, k: string) => cat.has(`runtime.${k}`);
const hdr = (doc: EvidenceDoc, cat: Catalog, name: string, test: RegExp | null, label: string): Signal[] => {
  const v = header(doc, name);
  return v != null && (!test || test.test(v)) && cat.has(`hdr.${name}`) ? [{ id: `hdr.${name}`, label, direct: true }] : [];
};
const rt = (cat: Catalog, k: string, label: string): Signal[] => (hasRuntime(cat, k) ? [{ id: `runtime.${k}`, label, direct: true }] : []);
const gen = (doc: EvidenceDoc, cat: Catalog, test: RegExp, label: string): Signal[] =>
  doc.passes.desktop.head.generator && test.test(doc.passes.desktop.head.generator) && cat.has("meta.generator") ? [{ id: "meta.generator", label, direct: true }] : [];
/** Asset URL pattern in the network log (the request itself is cited via net.totals or a ranked entry). */
const urlPattern = (doc: EvidenceDoc, cat: Catalog, test: RegExp, label: string): Signal[] => {
  const entries = doc.passes.desktop.network.entries;
  const i = entries.findIndex((e) => test.test(e.url));
  if (i === -1) return [];
  const id = cat.has(`net.${i}`) ? `net.${i}` : "net.totals";
  return [{ id, label: `${label} (${new URL(entries[i]!.url).pathname.slice(0, 60)})`, direct: false }];
};
const asn = (doc: EvidenceDoc, cat: Catalog, test: RegExp, label: string): Signal[] =>
  doc.dns?.asn.some((a) => a.org && test.test(a.org)) && cat.has("dns") ? [{ id: "dns", label, direct: false }] : [];
const cname = (doc: EvidenceDoc, cat: Catalog, test: RegExp, label: string): Signal[] =>
  doc.dns?.cnameChain.some((c) => test.test(c)) && cat.has("dns") ? [{ id: "dns", label, direct: true }] : [];

const RULES: { id: string; name: string; category: Technology["category"]; probe: Probe }[] = [
  { id: "nextjs", name: "Next.js", category: "framework", probe: (d, c) => [...rt(c, "__NEXT_DATA__", "__NEXT_DATA__ present"), ...rt(c, "next_app_router", "App Router flight data (__next_f)"), ...hdr(d, c, "x-powered-by", /next\.js/i, "x-powered-by: Next.js"), ...hdr(d, c, "x-nextjs-cache", null, "x-nextjs-cache header"), ...hdr(d, c, "x-nextjs-prerender", null, "x-nextjs-prerender header"), ...urlPattern(d, c, /\/_next\/static\//, "/_next/static/ assets")] },
  { id: "nuxt", name: "Nuxt", category: "framework", probe: (d, c) => [...rt(c, "__NUXT__", "__NUXT__ present"), ...urlPattern(d, c, /\/_nuxt\//, "/_nuxt/ assets")] },
  { id: "remix", name: "Remix", category: "framework", probe: (_d, c) => rt(c, "remix", "__remixContext present") },
  { id: "gatsby", name: "Gatsby", category: "framework", probe: (d, c) => [...rt(c, "gatsby", "___gatsby root"), ...gen(d, c, /gatsby/i, "generator: Gatsby")] },
  { id: "sveltekit", name: "SvelteKit", category: "framework", probe: (_d, c) => rt(c, "sveltekit", "SvelteKit data attributes") },
  { id: "astro", name: "Astro", category: "framework", probe: (d, c) => [...rt(c, "astro", "astro-island elements"), ...gen(d, c, /astro/i, "generator: Astro")] },
  { id: "angular", name: "Angular", category: "framework", probe: (_d, c) => rt(c, "ng_version", "ng-version attribute") },
  { id: "ember", name: "Ember", category: "framework", probe: (_d, c) => rt(c, "ember", "Ember global") },
  { id: "react", name: "React", category: "ui-library", probe: (_d, c) => [...rt(c, "react_root", "React root/fiber on DOM nodes")] },
  { id: "vue", name: "Vue", category: "ui-library", probe: (_d, c) => rt(c, "vue", "Vue global or data-v-app") },
  { id: "svelte", name: "Svelte", category: "ui-library", probe: (_d, c) => rt(c, "svelte", "svelte-* classes") },
  { id: "jquery", name: "jQuery", category: "ui-library", probe: (_d, c) => rt(c, "jquery", "jQuery global") },
  { id: "htmx", name: "htmx", category: "ui-library", probe: (_d, c) => rt(c, "htmx", "htmx global") },
  { id: "alpine", name: "Alpine.js", category: "ui-library", probe: (_d, c) => rt(c, "alpine", "Alpine global") },
  { id: "wordpress", name: "WordPress", category: "cms", probe: (d, c) => [...gen(d, c, /wordpress/i, "generator: WordPress"), ...rt(c, "wp", "wp global or /wp-content/ assets"), ...hdr(d, c, "link", /wp-json/i, "Link header to /wp-json/"), ...urlPattern(d, c, /\/wp-(content|includes)\//, "/wp-content/ assets")] },
  { id: "shopify", name: "Shopify", category: "commerce", probe: (d, c) => [...rt(c, "Shopify", "Shopify global"), ...hdr(d, c, "x-shopid", null, "x-shopid header"), ...hdr(d, c, "powered-by", /shopify/i, "powered-by: Shopify")] },
  { id: "wix", name: "Wix", category: "site-builder", probe: (d, c) => [...rt(c, "wix", "Wix session global"), ...gen(d, c, /wix/i, "generator: Wix")] },
  { id: "squarespace", name: "Squarespace", category: "site-builder", probe: (d, c) => [...rt(c, "squarespace", "Squarespace context"), ...gen(d, c, /squarespace/i, "generator: Squarespace")] },
  { id: "webflow", name: "Webflow", category: "site-builder", probe: (d, c) => [...rt(c, "webflow", "Webflow global"), ...gen(d, c, /webflow/i, "generator: Webflow")] },
  { id: "framer", name: "Framer", category: "site-builder", probe: (d, c) => [...rt(c, "framer", "Framer hydration markers"), ...gen(d, c, /framer/i, "generator: Framer")] },
  { id: "vercel", name: "Vercel", category: "hosting", probe: (d, c) => [...hdr(d, c, "x-vercel-id", null, "x-vercel-id header"), ...hdr(d, c, "server", /^vercel$/i, "server: Vercel"), ...cname(d, c, /vercel-dns|vercel\.app/i, "CNAME to Vercel")] },
  { id: "netlify", name: "Netlify", category: "hosting", probe: (d, c) => [...hdr(d, c, "x-nf-request-id", null, "x-nf-request-id header"), ...hdr(d, c, "server", /netlify/i, "server: Netlify")] },
  { id: "github-pages", name: "GitHub Pages", category: "hosting", probe: (d, c) => [...hdr(d, c, "server", /^github\.com$/i, "server: GitHub.com"), ...cname(d, c, /github\.io$/i, "CNAME to github.io")] },
  { id: "firebase", name: "Firebase Hosting", category: "hosting", probe: (d, c) => cname(d, c, /firebaseapp\.com|web\.app$/i, "CNAME to Firebase") },
  { id: "wpvip", name: "WordPress VIP", category: "hosting", probe: (d, c) => hdr(d, c, "x-powered-by", /wordpress vip/i, "x-powered-by: WordPress VIP") },
  { id: "cloudflare", name: "Cloudflare", category: "cdn", probe: (d, c) => [...hdr(d, c, "cf-ray", null, "cf-ray header"), ...hdr(d, c, "server", /^cloudflare$/i, "server: cloudflare"), ...asn(d, c, /cloudflare/i, "IP in Cloudflare's network (ASN)")] },
  { id: "cloudfront", name: "Amazon CloudFront", category: "cdn", probe: (d, c) => [...hdr(d, c, "x-amz-cf-id", null, "x-amz-cf-id header"), ...hdr(d, c, "via", /cloudfront/i, "via: CloudFront")] },
  { id: "fastly", name: "Fastly", category: "cdn", probe: (d, c) => [...hdr(d, c, "x-served-by", /cache-/i, "x-served-by: cache-*"), ...asn(d, c, /fastly/i, "IP in Fastly's network (ASN)")] },
  { id: "akamai", name: "Akamai", category: "cdn", probe: (d, c) => [...hdr(d, c, "server", /akamai/i, "server: Akamai"), ...asn(d, c, /akamai/i, "IP in Akamai's network (ASN)")] },
  { id: "nginx", name: "nginx", category: "web-server", probe: (d, c) => hdr(d, c, "server", /nginx/i, "server: nginx") },
  { id: "apache", name: "Apache HTTP Server", category: "web-server", probe: (d, c) => hdr(d, c, "server", /apache/i, "server: Apache") },
  { id: "litespeed", name: "LiteSpeed", category: "web-server", probe: (d, c) => hdr(d, c, "server", /litespeed/i, "server: LiteSpeed") },
];

const VENDOR_CATEGORY: Record<string, Technology["category"]> = {
  analytics: "analytics",
  "tag-manager": "tag-manager",
  ads: "ads",
  monitoring: "monitoring",
  payments: "payments",
  support: "support",
  consent: "consent",
  fonts: "fonts",
  cdn: "cdn",
  commerce: "commerce",
  cms: "cms",
  experimentation: "analytics",
};

export function fingerprint(doc: EvidenceDoc, cat: Catalog): Technology[] {
  const out: Technology[] = [];
  for (const r of RULES) {
    const signals = r.probe(doc, cat).filter((s) => cat.has(s.id));
    if (!signals.length) continue;
    const direct = signals.filter((s) => s.direct).length;
    const kind = direct > 0 ? "detected" : "inferred";
    // Detected: 90 + 3 per extra direct signal (max 99). Inferred: 60 + 8 per signal (max 80).
    const score = kind === "detected" ? Math.min(99, 90 + 3 * (direct - 1) + (signals.length - direct)) : Math.min(80, 52 + 8 * signals.length);
    out.push(
      TechnologySchema.parse({
        id: r.id,
        name: r.name,
        category: r.category,
        kind,
        score,
        signals: signals.map((s) => s.label).slice(0, 10),
        evidenceIds: [...new Set(signals.map((s) => s.id))].slice(0, 10),
      }),
    );
  }
  // Known third-party vendors are direct observations of requests to them.
  const seen = new Set(out.map((t) => t.name));
  for (const t of doc.thirdParties) {
    if (!t.vendor || seen.has(t.vendor) || !cat.has(`tp.${t.domain}`)) continue;
    const category = VENDOR_CATEGORY[t.category];
    if (!category) continue;
    seen.add(t.vendor);
    out.push(
      TechnologySchema.parse({
        id: `vendor.${t.domain}`.slice(0, 64),
        name: t.vendor,
        category,
        kind: "detected",
        score: 95,
        signals: [`${t.requests} request${t.requests === 1 ? "" : "s"} to ${t.domain}`],
        evidenceIds: [`tp.${t.domain}`],
      }),
    );
  }
  return out.slice(0, 60);
}
