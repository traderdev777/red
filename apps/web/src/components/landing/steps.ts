export interface Step {
  id: string;
  name: string;
  summary: string;
  file: string;
  snippet: string;
}

/** What each pipeline stage does. Snippets are illustrations of the log format, not live output. */
export const steps: Step[] = [
  {
    id: "collect",
    name: "Collect",
    summary:
      "Load the page the way a visitor's browser does. Keep every response, header, and asset it receives.",
    file: "collect · https://example.com/",
    snippet: `GET  https://example.com/            200  text/html
     redirects followed           1  (http → https)
     requests captured            all, with timing
parse response headers
     server, cache-control, content-security-policy,
     strict-transport-security, set-cookie, x-powered-by
snapshot DOM after hydration   +  full-page screenshot`,
  },
  {
    id: "fingerprint",
    name: "Fingerprint",
    summary:
      "Match what was received against known signatures. Each match keeps the exact bytes that triggered it.",
    file: "fingerprint · signatures",
    snippet: `match  path   /_next/static/chunks/*.js     → Next.js
match  header x-vercel-id                    → Vercel
match  attr   data-reactroot absent, RSC payload present
                                             → App Router
match  css    --tw-* custom properties       → Tailwind CSS
no match: analytics  →  reported as "not found", not guessed`,
  },
  {
    id: "compress",
    name: "Compress",
    summary:
      "Reduce the capture to what can carry a claim: landmarks, text, attributes, rules in use. Every excerpt keeps its source and locator.",
    file: "compress · evidence set",
    snippet: `dom      → landmarks, headings, links, forms, attributes
css      → rules referenced by rendered elements only
scripts  → URLs, sizes, load order (no source bodies)
evidence trimmed to excerpts
  { source: "html", url, locator: "head > link:nth-of-type(3)",
    excerpt: '<link rel="stylesheet" href="/app.css">' }`,
  },
  {
    id: "analyze",
    name: "Analyze",
    summary:
      "Turn evidence into findings. A finding without evidence is dropped. Each one is labelled detected or inferred and scored.",
    file: "analyze · findings",
    snippet: `finding  stack.framework
  kind      detected
  evidence  2 excerpts (path match, header)
finding  perf.render-blocking-css
  kind      detected
  evidence  stylesheet links in <head>, no media attribute
finding  product.primary-goal
  kind      inferred   ← stated as a judgment, with its signals`,
  },
  {
    id: "act",
    name: "Act",
    summary:
      "Each finding becomes something you can run: an explanation, a patch, a component, or a build prompt.",
    file: "act · actions",
    snippet: `action  inline critical CSS on /
  effort   hours
  output   patch for app/layout.tsx
action  rebuild pricing section
  output   original component + copy, same structure
  never    their logo, palette, imagery, or source code
action  export build prompts  → Antigravity`,
  },
];
