import { RuntimeSchema } from "@red/shared";
import type { z } from "zod";

/**
 * Allowlisted presence probes. Each expression returns a boolean computed in
 * the page; no value is ever read back. Adding a probe = adding a line here.
 */
export const RUNTIME_PROBES: Record<string, string> = {
  __NEXT_DATA__: "'__NEXT_DATA__' in window || !!document.getElementById('__NEXT_DATA__')",
  next_app_router: "'__next_f' in window",
  __NUXT__: "'__NUXT__' in window || '__NUXT_DATA__' in window || !!document.getElementById('__NUXT_DATA__')",
  ng_version: "!!document.querySelector('[ng-version]')",
  react_devtools_hook: "'__REACT_DEVTOOLS_GLOBAL_HOOK__' in window",
  react_root: "!!document.querySelector('[data-reactroot]') || [...document.querySelectorAll('body *')].slice(0, 200).some(e => Object.keys(e).some(k => k.startsWith('__reactFiber') || k.startsWith('__reactContainer')))",
  vue: "'__VUE__' in window || 'Vue' in window || !!document.querySelector('[data-v-app]')",
  svelte: "'__svelte' in window || !!document.querySelector('[class*=\"svelte-\"]')",
  sveltekit: "!!document.querySelector('[data-sveltekit-preload-data], [data-sveltekit-reload]') || Object.keys(window).some(k => k.startsWith('__sveltekit'))",
  astro: "!!document.querySelector('astro-island, [data-astro-cid]') || Object.keys(window).some(k => k === 'Astro')",
  remix: "'__remixContext' in window",
  gatsby: "'___gatsby' in window || !!document.getElementById('___gatsby')",
  ember: "'Ember' in window",
  jquery: "'jQuery' in window",
  Shopify: "'Shopify' in window",
  wp: "'wp' in window || !!document.querySelector('link[href*=\"/wp-content/\"], script[src*=\"/wp-content/\"], script[src*=\"/wp-includes/\"]')",
  wix: "'wixBiSession' in window",
  squarespace: "'Static' in window && 'SQUARESPACE_CONTEXT' in (window.Static || {})",
  webflow: "'Webflow' in window",
  framer: "!!document.querySelector('[data-framer-hydrate-v2], #__framer-badge-container')",
  gtag: "'gtag' in window",
  dataLayer: "'dataLayer' in window",
  fbq: "'fbq' in window",
  hj: "'hj' in window",
  Intercom: "'Intercom' in window",
  Stripe: "'Stripe' in window",
  Sentry: "'__SENTRY__' in window || 'Sentry' in window",
  turbo: "'Turbo' in window",
  htmx: "'htmx' in window",
  alpine: "'Alpine' in window",
};

export const RUNTIME_PROBE = `(() => {
  const out = {};
  ${Object.entries(RUNTIME_PROBES)
    .map(([k, expr]) => `try { out[${JSON.stringify(k)}] = !!(${expr}); } catch { out[${JSON.stringify(k)}] = false; }`)
    .join("\n  ")}
  return out;
})()`;

export function buildRuntime(raw: Record<string, unknown>): z.infer<typeof RuntimeSchema> {
  const globals: Record<string, boolean> = {};
  for (const k of Object.keys(RUNTIME_PROBES)) globals[k] = raw[k] === true;
  return RuntimeSchema.parse({ globals });
}
