/**
 * Google PageSpeed Insights v5. Google's servers load the page in Chrome and
 * run Lighthouse; we read the Lighthouse result. Used by lite collection,
 * where the host has no CPU to spare for a local Chrome.
 *
 * PSI fetches the site from Google's network, not ours, so it adds no SSRF
 * surface: the URL handed over has already passed assertPublicUrl.
 */
import { ProxyAgent, request, type Dispatcher } from "undici";
import { VitalsSchema, type Vitals } from "@red/shared";
import type { CdpRecord } from "./network";
import type { RawConsole } from "./console";
import { round } from "./util";

export type Strategy = "mobile" | "desktop";

export interface PsiAudit {
  title?: string;
  score?: number | null;
  displayValue?: string;
  numericValue?: number;
  details?: { type?: string; items?: Record<string, unknown>[]; data?: string };
}
export interface Lhr {
  lighthouseVersion?: string;
  finalDisplayedUrl?: string;
  runtimeError?: { code?: string; message?: string };
  categories?: Record<string, { score: number | null } | undefined>;
  audits?: Record<string, PsiAudit | undefined>;
}

export type PsiOutcome = { ok: true; lhr: Lhr; ms: number } | { ok: false; error: string; ms: number };

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

let devAgent: Dispatcher | undefined;
function dispatcher(upstream?: string): Dispatcher | undefined {
  if (!upstream) return undefined;
  devAgent ??= new ProxyAgent({ uri: upstream });
  return devAgent;
}

export function psiUrl(url: string, strategy: Strategy, key?: string): string {
  const q = new URLSearchParams({ url, strategy });
  for (const c of CATEGORIES) q.append("category", c);
  if (key) q.set("key", key);
  return `${ENDPOINT}?${q.toString()}`;
}

/** Google's error text, trimmed of the key and of anything long. */
export function psiError(status: number, body: string): string {
  let msg = "";
  try {
    msg = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? "";
  } catch {
    msg = body;
  }
  msg = msg.replace(/key=[A-Za-z0-9_-]+/g, "key=…").replace(/\s+/g, " ").trim().slice(0, 300);
  if (status === 429) return `PageSpeed Insights quota reached (HTTP 429)${msg ? `: ${msg}` : ""}`;
  return `PageSpeed Insights HTTP ${status}${msg ? `: ${msg}` : ""}`;
}

export async function runPsi(
  url: string,
  strategy: Strategy,
  opts: { key?: string; timeoutMs: number; upstream?: string },
): Promise<PsiOutcome> {
  const started = Date.now();
  try {
    const res = await request(psiUrl(url, strategy, opts.key), {
      method: "GET",
      dispatcher: dispatcher(opts.upstream),
      headersTimeout: opts.timeoutMs,
      bodyTimeout: opts.timeoutMs,
      headers: { accept: "application/json" },
    });
    const body = await res.body.text();
    if (res.statusCode !== 200) return { ok: false, error: psiError(res.statusCode, body), ms: Date.now() - started };
    const json = JSON.parse(body) as { lighthouseResult?: Lhr };
    if (!json.lighthouseResult) return { ok: false, error: "PageSpeed Insights returned no Lighthouse result", ms: Date.now() - started };
    return { ok: true, lhr: json.lighthouseResult, ms: Date.now() - started };
  } catch (e) {
    const m = (e as Error).message ?? String(e);
    const timedOut = /timeout/i.test(m) || (e as { code?: string }).code?.includes("TIMEOUT");
    return {
      ok: false,
      error: timedOut ? `PageSpeed Insights did not answer within ${Math.round(opts.timeoutMs / 1000)}s` : `PageSpeed Insights request failed: ${m.slice(0, 200)}`,
      ms: Date.now() - started,
    };
  }
}

const items = (lhr: Lhr, id: string) => (lhr.audits?.[id]?.details?.items ?? []) as Record<string, unknown>[];
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Lighthouse's network-requests audit as the CdpRecord shape buildNetwork reads. */
export function networkFromLhr(lhr: Lhr): CdpRecord[] {
  return items(lhr, "network-requests").flatMap((it, i) => {
    const url = str(it.url);
    if (!url) return [];
    const start = num(it.networkRequestTime) ?? num(it.rendererStartTime) ?? num(it.startTime) ?? 0;
    const end = num(it.networkEndTime) ?? num(it.endTime);
    const status = num(it.statusCode);
    return [
      {
        requestId: `psi-${i}`,
        url,
        method: "GET",
        type: str(it.resourceType) ?? "Other",
        initiator: { type: "other" },
        startTs: start / 1000,
        endTs: end != null ? end / 1000 : undefined,
        status: status != null && status > 0 ? status : undefined,
        mimeType: str(it.mimeType),
        encodedDataLength: num(it.transferSize),
        failed: it.finished === false ? "did not finish" : status === -1 ? "failed" : undefined,
      },
    ];
  });
}

/** Lab vitals from Lighthouse. INP needs a real interaction, so it stays null. */
export function vitalsFromLhr(lhr: Lhr | null): Vitals {
  const v = (id: string) => num(lhr?.audits?.[id]?.numericValue) ?? null;
  return VitalsSchema.parse({
    lcpMs: round(v("largest-contentful-paint")),
    cls: v("cumulative-layout-shift") == null ? null : round(v("cumulative-layout-shift"), 4),
    fcpMs: round(v("first-contentful-paint")),
    inpProxyMs: null,
    tbtProxyMs: round(v("total-blocking-time")),
  });
}

export function consoleFromLhr(lhr: Lhr | null): RawConsole {
  if (!lhr) return { errors: [], failedRequests: [] };
  return {
    errors: items(lhr, "errors-in-console")
      .slice(0, 100)
      .map((it) => ({
        text: str(it.description) ?? "",
        url: str((it.sourceLocation as { url?: string } | undefined)?.url) ?? str(it.url) ?? null,
      }))
      .filter((e) => e.text),
    failedRequests: [],
  };
}

export function screenshotFromLhr(lhr: Lhr | null): Buffer | null {
  const data = lhr?.audits?.["final-screenshot"]?.details?.data;
  const m = typeof data === "string" ? data.match(/^data:image\/(?:jpeg|jpg|webp|png);base64,(.+)$/) : null;
  return m?.[1] ? Buffer.from(m[1], "base64") : null;
}
