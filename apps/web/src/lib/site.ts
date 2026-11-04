/** Base path for static hosting under a subpath (GitHub Pages project site); empty otherwise. */
export const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
/** Prefix a root-relative href with the base path. Next <Link> does this itself; plain <a> and metadata do not. */
export const withBase = (href: string) => (href.startsWith("/") ? `${basePath}${href}` : href);

/** Canonical site facts used by metadata, sitemap, robots, JSON-LD, and OG. */
export const site = {
  name: "RED",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  title: "RED · Paste a link. See how it's built.",
  description:
    "RED collects real evidence from any public site, labels what is detected vs inferred, then turns it into code and build prompts.",
  nav: [
    { href: "/#how-it-works", label: "How it works" },
    { href: "/#evidence", label: "Evidence" },
    { href: "/#actions", label: "Actions" },
    { href: "/#pricing", label: "Pricing" },
  ],
} as const;
