/**
 * One viewport pass: a fresh browser context, one page view, the raw
 * observations. Pure modules turn the raw data into validated evidence.
 *
 * The page is loaded exactly as a visitor's browser would load it, with an
 * honest User-Agent. Nothing is clicked, typed, solved, or spoofed.
 */
import type { Browser, BrowserContext, CDPSession, Page, Request, Response } from "playwright";
import { EVIDENCE_LIMITS, validatePublicUrl } from "@red/shared";
import { ScanFailure, MESSAGES, isTransient, netError } from "../errors";
import { detectBotWall } from "./botwall";
import type { CdpRecord } from "./network";
import type { RawHead } from "./html";
import { HEAD_PROBE } from "./html";
import type { RawAssets } from "./assets";
import { ASSETS_PROBE } from "./assets";
import { RUNTIME_PROBE } from "./runtime";
import { VITALS_INIT, VITALS_READ, type RawVitals } from "./vitals";
import type { RawConsole } from "./console";
import type { RawCookie } from "./cookies";
import type { RawSecurityDetails } from "./tlsDns";
import type { InspectedAsset } from "./sourcemaps";
import { lowerHeaders } from "./util";

export type Milestone = "navigation" | "settled" | "probed";

export interface PassOptions {
  browser: Browser;
  url: string;
  kind: "desktop" | "mobile";
  userAgent: string;
  deadline: number;
  /** Async check for every main-frame navigation (initial and client-side). Throws on unsafe. */
  checkNavigation: (url: string) => Promise<void>;
  /** Hosts the egress guard refused during this pass. */
  guardBlocks: () => { host: string; reason: string }[];
  onMilestone?: (m: Milestone) => Promise<void> | void;
  /** Test-only: fixture servers use self-signed or plain http. */
  testMode?: boolean;
}

export interface RawPass {
  viewport: { width: number; height: number };
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  hops: { url: string; status: number; location: string | null }[];
  perf: { responseStart?: number; domContentLoadedEventEnd?: number; loadEventEnd?: number } | null;
  headers: { name: string; value: string }[];
  html: string | null;
  head: RawHead;
  assets: RawAssets;
  runtime: Record<string, unknown>;
  vitals: RawVitals | null;
  console: RawConsole;
  cookies: RawCookie[];
  network: CdpRecord[];
  security: RawSecurityDetails | null;
  screenshot: Buffer | null;
  inspected: InspectedAsset[];
}

const PERF_PROBE = `(() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { responseStart: n.responseStart, domContentLoadedEventEnd: n.domContentLoadedEventEnd, loadEventEnd: n.loadEventEnd } : null; })()`;

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

const remaining = (deadline: number) => Math.max(0, deadline - Date.now());

async function contextFor(o: PassOptions): Promise<BrowserContext> {
  const mobile = o.kind === "mobile";
  return o.browser.newContext({
    viewport: VIEWPORTS[o.kind],
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    userAgent: o.userAgent,
    locale: "en-US",
    acceptDownloads: false,
    serviceWorkers: "block",
    permissions: [],
    ignoreHTTPSErrors: !!o.testMode && process.env.NODE_ENV === "test",
    javaScriptEnabled: true,
    bypassCSP: false,
  });
}

function recordNetwork(cdp: CDPSession, records: Map<string, CdpRecord>, finished: CdpRecord[]) {
  cdp.on("Network.requestWillBeSent", (e) => {
    const prev = records.get(e.requestId);
    if (prev && e.redirectResponse) {
      // A redirect reuses the request id: close out the previous hop.
      prev.status = e.redirectResponse.status;
      prev.responseHeaders = e.redirectResponse.headers as Record<string, string>;
      prev.endTs = e.timestamp;
      prev.encodedDataLength = e.redirectResponse.encodedDataLength;
      finished.push(prev);
    }
    records.set(e.requestId, {
      requestId: e.requestId,
      url: e.request.url,
      method: e.request.method,
      type: e.type ?? "Other",
      initiator: e.initiator as CdpRecord["initiator"],
      startTs: e.timestamp,
    });
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = records.get(e.requestId);
    if (!r) return;
    r.status = e.response.status;
    r.responseHeaders = e.response.headers as Record<string, string>;
    r.mimeType = e.response.mimeType;
    r.fromCache = !!(e.response.fromDiskCache || e.response.fromServiceWorker || e.response.fromPrefetchCache);
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = records.get(e.requestId);
    if (!r) return;
    r.endTs = e.timestamp;
    r.encodedDataLength = e.encodedDataLength;
  });
  cdp.on("Network.loadingFailed", (e) => {
    const r = records.get(e.requestId);
    if (!r) return;
    r.endTs = e.timestamp;
    r.failed = e.blockedReason ? `blocked:${e.blockedReason}` : e.errorText;
  });
}

/** Waits until no request has been in flight for `quietMs`, or `maxMs` passes. */
async function networkQuiet(records: Map<string, CdpRecord>, quietMs: number, maxMs: number) {
  const end = Date.now() + maxMs;
  let quietSince = Date.now();
  while (Date.now() < end) {
    const inflight = [...records.values()].some((r) => r.endTs == null && r.failed == null);
    if (inflight) quietSince = Date.now();
    else if (Date.now() - quietSince >= quietMs) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function redirectHops(response: Response): RawPass["hops"] {
  const hops: RawPass["hops"] = [];
  let req: Request | null = response.request().redirectedFrom();
  const chain: Request[] = [];
  while (req) {
    chain.unshift(req);
    req = req.redirectedFrom();
  }
  for (const r of chain) {
    // redirectedFrom requests carry their own (redirect) response.
    hops.push({ url: r.url(), status: 0, location: r.redirectedTo()?.url() ?? null });
  }
  return hops;
}

async function fillHopStatuses(hops: RawPass["hops"], response: Response) {
  let req: Request | null = response.request().redirectedFrom();
  const chain: Request[] = [];
  while (req) {
    chain.unshift(req);
    req = req.redirectedFrom();
  }
  await Promise.all(
    chain.map(async (r, i) => {
      const res = await r.response().catch(() => null);
      if (hops[i]) {
        hops[i]!.status = res?.status() ?? 0;
        const loc = res ? (await res.headerValue("location").catch(() => null)) : null;
        if (loc) hops[i]!.location = new URL(loc, r.url()).toString();
      }
    }),
  );
}

export async function runPass(o: PassOptions): Promise<RawPass> {
  const context = await contextFor(o);
  try {
    return await runInContext(o, context);
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function runInContext(o: PassOptions, context: BrowserContext): Promise<RawPass> {
  await context.addInitScript(VITALS_INIT);
  const page: Page = await context.newPage();

  // Popups and new windows: closed immediately; we only view the one page.
  context.on("page", (p) => {
    if (p !== page) void p.close().catch(() => undefined);
  });
  page.on("dialog", (d) => void d.dismiss().catch(() => undefined));
  page.on("download", (d) => void d.cancel().catch(() => undefined));

  const records = new Map<string, CdpRecord>();
  const finishedHops: CdpRecord[] = [];
  const cdp = await context.newCDPSession(page);
  recordNetwork(cdp, records, finishedHops);
  await cdp.send("Network.enable", { maxResourceBufferSize: 8 * 1024 * 1024, maxTotalBufferSize: 64 * 1024 * 1024 });

  const consoleRaw: RawConsole = { errors: [], failedRequests: [] };
  page.on("console", (m) => {
    if (m.type() === "error" && consoleRaw.errors.length < 100) {
      consoleRaw.errors.push({ text: m.text(), url: m.location()?.url || null });
    }
  });
  page.on("pageerror", (err) => {
    if (consoleRaw.errors.length < 100) consoleRaw.errors.push({ text: `Uncaught ${err.name}: ${err.message}`, url: null });
  });
  page.on("requestfailed", (r) => {
    if (consoleRaw.failedRequests.length < 100) {
      consoleRaw.failedRequests.push({ url: r.url(), method: r.method(), resourceType: r.resourceType(), error: r.failure()?.errorText ?? "failed" });
    }
  });

  // Main-frame navigations (the first load and any script-driven one) are
  // re-checked with assertPublicUrl before the browser may connect.
  let navBlocked: string | null = null;
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
      try {
        await o.checkNavigation(req.url());
      } catch (e) {
        navBlocked = `${new URL(req.url()).hostname}: ${(e as Error).message}`;
        return route.abort("blockedbyclient");
      }
    }
    return route.continue();
  });
  // Redirect hops never reach route(); validate each one as it is followed.
  page.on("request", (req) => {
    if (req.redirectedFrom() && req.isNavigationRequest() && req.frame() === page.mainFrame()) {
      const v = o.testMode && process.env.NODE_ENV === "test" ? null : validatePublicUrl(req.url());
      if (v && !v.ok) navBlocked = `${safeHost(req.url())}: ${v.reason}`;
      void o.checkNavigation(req.url()).catch((e) => {
        navBlocked = `${safeHost(req.url())}: ${(e as Error).message}`;
      });
    }
  });

  const failSsrf = (why: string) =>
    new ScanFailure("ssrf", MESSAGES.ssrf, { reason: why, blocks: o.guardBlocks() });

  let response: Response | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      response = await page.goto(o.url, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(30_000, Math.max(5_000, remaining(o.deadline) - 20_000)),
      });
      break;
    } catch (e) {
      if (navBlocked) throw failSsrf(navBlocked);
      const blocks = o.guardBlocks();
      if (blocks.length && /ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY|ERR_BLOCKED/.test(String(e))) {
        throw failSsrf(`${blocks[0]!.host}: ${blocks[0]!.reason}`);
      }
      if (attempt === 1 && isTransient(e) && remaining(o.deadline) > 25_000) {
        await new Promise((r) => setTimeout(r, 1_000));
        continue;
      }
      if (/Timeout/i.test(String(e))) throw new ScanFailure("timeout", "The page did not respond in time.");
      throw new ScanFailure("network", `Couldn't load the page (${netError(e)}).`);
    }
  }
  if (navBlocked) throw failSsrf(navBlocked);
  if (!response) throw new ScanFailure("network", "The page returned no response.");

  const headersArray = await response.headersArray();
  const lh = lowerHeaders(Object.fromEntries(headersArray.map((h) => [h.name, h.value])));
  let html: string | null = null;
  try {
    const body = await response.body();
    html = body.subarray(0, EVIDENCE_LIMITS.htmlBytes + 4).toString("utf8");
    if (body.length > EVIDENCE_LIMITS.htmlBytes) html = body.toString("utf8"); // truncation recorded by buildHtml
  } catch {
    html = null;
  }
  const title = await page.title().catch(() => null);

  const wall = detectBotWall({ status: response.status(), headers: lh, title, htmlHead: (html ?? "").slice(0, 65_536) });
  if (wall) throw new ScanFailure("bot_wall", MESSAGES.botWall, { vendor: wall.vendor, signal: wall.signal, status: response.status() });

  await o.onMilestone?.("navigation");

  await page.waitForLoadState("load", { timeout: Math.min(10_000, remaining(o.deadline) - 15_000) }).catch(() => undefined);
  await networkQuiet(records, 800, Math.min(6_000, Math.max(0, remaining(o.deadline) - 15_000)));
  if (navBlocked) throw failSsrf(navBlocked);
  await o.onMilestone?.("settled");

  const [head, assets, runtime, vitals, perf, cookies] = await Promise.all([
    page.evaluate(HEAD_PROBE).catch(() => ({ title, lang: null, meta: [], links: [], jsonLd: [] })) as Promise<RawHead>,
    page.evaluate(ASSETS_PROBE).catch(() => ({ scripts: [], styles: [] })) as Promise<RawAssets>,
    page.evaluate(RUNTIME_PROBE).catch(() => ({})) as Promise<Record<string, unknown>>,
    page.evaluate(VITALS_READ).catch(() => null) as Promise<RawVitals | null>,
    page
      .evaluate(PERF_PROBE)
      .catch(() => null) as Promise<RawPass["perf"]>,
    context.cookies(),
  ]);
  await o.onMilestone?.("probed");

  const screenshot = await page
    .screenshot({ type: "jpeg", quality: 70, fullPage: false, timeout: 8_000, animations: "disabled" })
    .catch(() => null);

  // Desktop only: read the tail of script/stylesheet bodies for sourceMappingURL.
  const inspected: InspectedAsset[] = [];
  if (o.kind === "desktop") {
    const candidates = [...records.values()]
      .filter((r) => (r.type === "Script" || r.type === "Stylesheet") && r.status && r.status < 400 && !r.failed)
      .slice(0, 80);
    for (const r of candidates) {
      if (remaining(o.deadline) < 20_000) break;
      const headers = lowerHeaders(r.responseHeaders ?? {});
      let tail: string | null = null;
      if (!headers["sourcemap"] && !headers["x-sourcemap"]) {
        try {
          const b = (await cdp.send("Network.getResponseBody", { requestId: r.requestId })) as { body: string; base64Encoded: boolean };
          const text = b.base64Encoded ? Buffer.from(b.body, "base64").toString("utf8") : b.body;
          tail = text.length > EVIDENCE_LIMITS.resourceInspectBytes ? text.slice(-EVIDENCE_LIMITS.resourceInspectBytes) : text;
        } catch {
          tail = null;
        }
      }
      inspected.push({ url: r.url, headers, tail });
    }
  }

  const hops = redirectHops(response);
  await fillHopStatuses(hops, response);

  const security = await response.securityDetails().catch(() => null);

  return {
    viewport: VIEWPORTS[o.kind],
    requestedUrl: o.url,
    finalUrl: page.url() || response.url(),
    status: response.status(),
    hops,
    perf,
    headers: headersArray,
    html,
    head,
    assets,
    runtime,
    vitals,
    console: consoleRaw,
    cookies: cookies as RawCookie[],
    network: [...finishedHops, ...records.values()],
    security: security ? { ...security } : null,
    screenshot,
    inspected,
  };
}

function safeHost(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    return u.slice(0, 100);
  }
}
