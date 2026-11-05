import { VitalsSchema, type Vitals } from "@red/shared";
import { round } from "./util";

/** Installed before any page script runs. Observers only; nothing is changed. */
export const VITALS_INIT = `(() => {
  const v = { lcp: null, cls: 0, fcp: null, inp: null, longTasks: [] };
  Object.defineProperty(window, '__redVitals', { value: v, enumerable: false });
  const obs = (type, cb, opts) => { try { new PerformanceObserver(l => l.getEntries().forEach(cb)).observe({ type, buffered: true, ...opts }); } catch {} };
  obs('largest-contentful-paint', e => { v.lcp = e.renderTime || e.loadTime || e.startTime; });
  obs('layout-shift', e => { if (!e.hadRecentInput) v.cls += e.value; });
  obs('paint', e => { if (e.name === 'first-contentful-paint') v.fcp = e.startTime; });
  obs('event', e => { v.inp = Math.max(v.inp || 0, e.duration); }, { durationThreshold: 16 });
  obs('longtask', e => { if (v.longTasks.length < 500) v.longTasks.push([e.startTime, e.duration]); });
})()`;

export const VITALS_READ = `(() => { const v = window.__redVitals; return v ? { lcp: v.lcp, cls: v.cls, fcp: v.fcp, inp: v.inp, longTasks: v.longTasks } : null; })()`;

export interface RawVitals {
  lcp: number | null;
  cls: number | null;
  fcp: number | null;
  inp: number | null;
  longTasks: [number, number][];
}

export function buildVitals(raw: RawVitals | null): Vitals {
  if (!raw) return VitalsSchema.parse({ lcpMs: null, cls: null, fcpMs: null, inpProxyMs: null, tbtProxyMs: null });
  const fcp = raw.fcp ?? 0;
  const tbt =
    raw.fcp == null
      ? null
      : raw.longTasks.filter(([start]) => start >= fcp).reduce((n, [, d]) => n + Math.max(0, d - 50), 0);
  return VitalsSchema.parse({
    lcpMs: round(raw.lcp),
    cls: raw.cls == null ? null : round(raw.cls, 4),
    fcpMs: round(raw.fcp),
    inpProxyMs: round(raw.inp),
    tbtProxyMs: round(tbt),
  });
}
