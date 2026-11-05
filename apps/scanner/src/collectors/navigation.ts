import { NavigationSchema, type Navigation } from "@red/shared";
import { capUrl, round } from "./util";

export interface RawNavigation {
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  /** Redirect hops in order, as the browser followed them. */
  hops: { url: string; status: number; location: string | null }[];
  /** PerformanceNavigationTiming fields, ms relative to navigation start. */
  perf: { responseStart?: number; domContentLoadedEventEnd?: number; loadEventEnd?: number } | null;
}

export function buildNavigation(raw: RawNavigation): Navigation {
  const p = raw.perf ?? {};
  const pos = (n: number | undefined) => (n && n > 0 ? round(n) : null);
  return NavigationSchema.parse({
    requestedUrl: capUrl(raw.requestedUrl),
    finalUrl: capUrl(raw.finalUrl),
    status: raw.status,
    redirectChain: raw.hops.map((h) => ({ url: capUrl(h.url), status: h.status, location: h.location ? capUrl(h.location) : null })),
    timing: {
      ttfbMs: pos(p.responseStart),
      domContentLoadedMs: pos(p.domContentLoadedEventEnd),
      loadMs: pos(p.loadEventEnd),
    },
  });
}
