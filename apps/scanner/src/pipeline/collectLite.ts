/**
 * Lite collection (SCANNER_MODE=lite), for hosts too small to run Chrome.
 *
 *   - The document, redirects, headers, Set-Cookie and HTML come from one
 *     plain HTTP fetch through the GuardProxy (same SSRF rules as Chrome).
 *     No page script runs, so head/assets/markers are read from served HTML.
 *   - Lighthouse, lab vitals, the request list, console errors and
 *     screenshots come from Google PageSpeed Insights (mobile + desktop),
 *     which loads the page in Chrome on Google's side.
 *
 * The evidence records mode "lite" and notes what that means, and the report
 * shows it. Nothing is estimated to fill a gap: a PSI failure is recorded.
 */
import {
  EVIDENCE_LIMITS,
  EVIDENCE_VERSION,
  EvidenceDocSchema,
  NavigationSchema,
  RuntimeSchema,
  storageKeyFor,
  type EvidenceDoc,
  type Pass,
} from "@red/shared";
import { assertPublicUrl } from "@red/shared/server";
import { ScanFailure, MESSAGES } from "../errors";
import { GuardProxy, type BlockEvent, type Resolve } from "../net/guardProxy";
import { GuardedFetcher, type CappedResponse } from "../net/fetcher";
import { probeTls } from "../net/tlsProbe";
import { isAllowed } from "../net/robots";
import { detectBotWall } from "../collectors/botwall";
import { VIEWPORTS } from "../collectors/pass";
import { buildDocumentHeaders } from "../collectors/headers";
import { buildCookies } from "../collectors/cookies";
import { buildHead, buildHtml } from "../collectors/html";
import { buildAssets } from "../collectors/assets";
import { buildNetwork, type CdpRecord } from "../collectors/network";
import { buildConsole } from "../collectors/console";
import { groupThirdParties } from "../collectors/thirdParties";
import { buildWellKnown, WELL_KNOWN_PATHS } from "../collectors/wellKnown";
import { buildSourceMaps, findReferences, summarizeMap, type InspectedAsset } from "../collectors/sourcemaps";
import { buildTls, collectDns } from "../collectors/tlsDns";
import { buildLighthouse, skippedLighthouse } from "../collectors/lighthouse";
import { parseDocument, parseSetCookies, staticAssets, staticGlobals, staticHead } from "../collectors/static";
import { consoleFromLhr, networkFromLhr, runPsi, screenshotFromLhr, vitalsFromLhr, type Lhr, type PsiOutcome } from "../collectors/psi";
import { hostOf, isoUtc, lowerHeaders, round } from "../collectors/util";
import { MILESTONES, enforceSize, summarize } from "./collect";
import type { StageContext } from "./types";

export const LITE_NOTES = [
  "Lite collection: the page's HTML was fetched over HTTP without running its scripts, so content added in the browser is not in the head, asset and marker readings.",
  "Lighthouse scores, lab vitals, the request list, console errors and screenshots come from Google PageSpeed Insights, which loads the page in Chrome from Google's network.",
];

export interface LiteDeps {
  resolve?: Resolve;
  testAllow?: string[];
  psi?: (url: string, strategy: "mobile" | "desktop", timeoutMs: number) => Promise<PsiOutcome>;
}

/** The served HTML looks like an empty shell that the browser fills in. */
export function looksClientRendered(html: string): boolean {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const text = body
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<[^>]+>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length < 200 && /<script\b/i.test(body);
}

function documentRecord(res: CappedResponse): CdpRecord {
  return {
    requestId: "doc",
    url: res.url,
    method: "GET",
    type: "Document",
    initiator: { type: "other" },
    startTs: 0,
    status: res.status,
    responseHeaders: res.headers,
    mimeType: res.headers["content-type"]?.split(";")[0],
    encodedDataLength: res.bytes ?? res.body.length,
  };
}

interface Shared {
  res: CappedResponse;
  html: string;
  finalHost: string;
  headParsed: ReturnType<typeof staticHead>;
  assetsParsed: ReturnType<typeof staticAssets>;
  globals: Record<string, boolean>;
  clientRendered: boolean;
}

function litePass(kind: "desktop" | "mobile", s: Shared, lhr: Lhr | null, keepHtml: boolean): Pass {
  const records = lhr ? networkFromLhr(lhr) : [];
  const network = buildNetwork(records.length ? records : [documentRecord(s.res)], s.finalHost);
  // Lighthouse's network audit has no response headers; the document's we have.
  const doc = network.entries.find((e) => e.resourceType === "document");
  if (doc) {
    const h = lowerHeaders(s.res.headers);
    doc.cache = {
      cacheControl: h["cache-control"]?.slice(0, 500) ?? null,
      age: h["age"]?.slice(0, 50) ?? null,
      etag: "etag" in h,
      lastModified: "last-modified" in h,
      expires: h["expires"]?.slice(0, 100) ?? null,
    };
  }
  const ttfb = lhr?.audits?.["server-response-time"]?.numericValue;
  const incomplete: string[] = [];
  if (!lhr) incomplete.push("vitals", "timing");
  if (s.clientRendered) incomplete.push("head", "assets");
  const headerList = Object.entries(s.res.headers)
    .filter(([k]) => k !== "set-cookie")
    .map(([name, value]) => ({ name, value }));
  if (s.res.setCookies.length) headerList.push({ name: "set-cookie", value: s.res.setCookies.join("\n") });
  return {
    viewport: VIEWPORTS[kind],
    navigation: NavigationSchema.parse({
      requestedUrl: s.res.hops[0]?.url ?? s.res.url,
      finalUrl: s.res.url,
      status: s.res.status,
      redirectChain: s.res.hops,
      timing: { ttfbMs: typeof ttfb === "number" ? round(ttfb) : null, domContentLoadedMs: null, loadMs: null },
    }),
    document: buildDocumentHeaders(headerList),
    cookies: buildCookies(parseSetCookies(s.res.setCookies, s.finalHost), s.finalHost),
    html: buildHtml(s.html, keepHtml),
    head: buildHead(s.headParsed, s.res.url),
    assets: buildAssets(s.assetsParsed, network.entries, s.finalHost),
    network,
    runtime: RuntimeSchema.parse({ globals: s.globals }),
    console: buildConsole(consoleFromLhr(lhr)),
    vitals: vitalsFromLhr(lhr),
    incomplete,
  };
}

export async function collectLite(ctx: StageContext, deps: LiteDeps = {}): Promise<void> {
  const { scan, cfg, db, log } = ctx;
  const started = Date.now();
  const deadline = started + cfg.SCAN_TIMEOUT_MS - 1_500;
  const testMode = process.env.NODE_ENV === "test" && (deps.testAllow?.length ?? 0) > 0;
  const testAllowed = (u: string) => {
    if (!testMode) return false;
    try {
      const x = new URL(u);
      return deps.testAllow!.includes(`${x.hostname}:${x.port || (x.protocol === "https:" ? 443 : 80)}`);
    } catch {
      return false;
    }
  };

  try {
    if (!testAllowed(scan.url)) await assertPublicUrl(scan.url, deps.resolve);
  } catch (e) {
    throw new ScanFailure("ssrf", MESSAGES.ssrf, { reason: (e as Error).message, phase: "initial" });
  }

  const blocks: BlockEvent[] = [];
  const guard = new GuardProxy({
    upstream: cfg.SCANNER_UPSTREAM_PROXY ?? null,
    resolve: deps.resolve,
    testAllow: deps.testAllow,
    onBlock: (e) => {
      if (blocks.length < 200) blocks.push(e);
      log.warn({ host: e.host, port: e.port, reason: e.reason }, "egress blocked");
    },
  });
  await guard.start();
  const fetcher = new GuardedFetcher(guard.url, cfg.userAgent, testAllowed);
  const psi =
    deps.psi ??
    ((url: string, strategy: "mobile" | "desktop", timeoutMs: number) =>
      runPsi(url, strategy, { key: cfg.PSI_API_KEY, timeoutMs, upstream: cfg.SCANNER_UPSTREAM_PROXY }));

  try {
    // 1. The document (10).
    let res: CappedResponse;
    try {
      res = await fetcher.get(scan.url, EVIDENCE_LIMITS.htmlBytes, 15_000, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8");
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      if (blocks.length || /^blocked:/.test(msg)) {
        throw new ScanFailure("ssrf", MESSAGES.ssrf, { reason: blocks[0]?.reason ?? msg, phase: "navigation" });
      }
      throw new ScanFailure("network", `Couldn't load the page: ${msg.slice(0, 200)}`, { phase: "navigation" });
    }
    const html = res.body.toString("utf8");
    const headers = lowerHeaders(res.headers);
    const root = parseDocument(html);
    const headParsed = staticHead(root);
    const wall = detectBotWall({ status: res.status, headers, title: headParsed.title, htmlHead: html.slice(0, 64 * 1024) });
    if (wall) throw new ScanFailure("bot_wall", MESSAGES.botWall, { vendor: wall.vendor, signal: wall.signal });
    await ctx.progress(MILESTONES.navigation);

    const finalHost = hostOf(res.url) || hostOf(scan.url);
    const origin = new URL(res.url).origin;
    const shared: Shared = {
      res,
      html,
      finalHost,
      headParsed,
      assetsParsed: staticAssets(root, res.url),
      globals: staticGlobals(html, root),
      clientRendered: looksClientRendered(html),
    };

    // 2. PageSpeed Insights (both strategies) runs beside everything else.
    const psiBudget = Math.max(10_000, deadline - Date.now() - 8_000);
    const psiP = Promise.all([psi(res.url, "mobile", psiBudget), psi(res.url, "desktop", psiBudget)]);

    const wellKnownP = Promise.all(
      WELL_KNOWN_PATHS.map(async (path) => {
        const url = `${origin}${path}`;
        try {
          return buildWellKnown(path, url, await fetcher.get(url, EVIDENCE_LIMITS.wellKnownHeadBytes * 4), null);
        } catch (e) {
          return buildWellKnown(path, url, null, (e as Error).message);
        }
      }),
    );
    const dnsP = testMode ? Promise.resolve(null) : collectDns(finalHost).catch(() => null);
    const tlsP = res.url.startsWith("https:") && !testMode ? probeTls(guard.url, finalHost).catch(() => null) : Promise.resolve(null);

    // First-party scripts' tails, for the source-map references they carry (at most 4).
    const firstPartyScripts = shared.assetsParsed.scripts
      .filter((s) => s.src && hostOf(s.src) === finalHost)
      .slice(0, 4)
      .map((s) => s.src!);
    const inspected: InspectedAsset[] = await Promise.all(
      firstPartyScripts.map(async (url) => {
        try {
          const r = await fetcher.get(url, EVIDENCE_LIMITS.resourceInspectBytes, 6_000);
          return { url, headers: lowerHeaders(r.headers), tail: r.truncated ? null : r.body.toString("utf8") };
        } catch {
          return { url, headers: {}, tail: null };
        }
      }),
    );
    await ctx.progress(MILESTONES.settled);

    const wellKnown = await wellKnownP;
    const robots = wellKnown.find((w) => w.path === "/robots.txt");
    const robotsText = robots?.exists ? robots.head : null;
    const referenced = findReferences(inspected);
    const fetched = await Promise.all(
      referenced
        .filter((r) => r.mapUrl.startsWith("http"))
        .slice(0, EVIDENCE_LIMITS.sourceMapsFetched)
        .map(async (r) => {
          const path = new URL(r.mapUrl).pathname;
          if (hostOf(r.mapUrl) === finalHost && !isAllowed(robotsText, path)) return summarizeMap(r.mapUrl, null, null, false, "disallowed by robots.txt");
          try {
            const m = await fetcher.get(r.mapUrl, EVIDENCE_LIMITS.resourceInspectBytes, 5_000);
            return summarizeMap(r.mapUrl, m.status, m.status < 400 ? m.body.toString("utf8") : null, m.truncated, m.status >= 400 ? `HTTP ${m.status}` : null);
          } catch (e) {
            return summarizeMap(r.mapUrl, null, null, false, (e as Error).message.slice(0, 200));
          }
        }),
    );

    await ctx.progress(MILESTONES.probed);
    const [mobilePsi, desktopPsi] = await psiP;
    await ctx.progress(MILESTONES.mobile);
    const mLhr = mobilePsi.ok ? mobilePsi.lhr : null;
    const dLhr = desktopPsi.ok ? desktopPsi.lhr : null;
    log.info({ mobile: mobilePsi.ok ? `${mobilePsi.ms}ms` : mobilePsi.error, desktop: desktopPsi.ok ? `${desktopPsi.ms}ms` : desktopPsi.error }, "psi");

    // Lighthouse = PSI mobile (same form factor as local Lighthouse).
    const lighthouse = mobilePsi.ok ? buildLighthouse(mobilePsi.lhr) : skippedLighthouse("failed", mobilePsi.error);
    await ctx.progress(MILESTONES.lighthouse);

    const shots = { desktop: null as string | null, mobile: null as string | null };
    const dShot = screenshotFromLhr(dLhr);
    const mShot = screenshotFromLhr(mLhr);
    if (dShot) {
      shots.desktop = storageKeyFor(scan.id, "desktop.jpg");
      await db.upload(shots.desktop, dShot, "image/jpeg");
    }
    if (mShot) {
      shots.mobile = storageKeyFor(scan.id, "mobile.jpg");
      await db.upload(shots.mobile, mShot, "image/jpeg");
    }

    const desktop = litePass("desktop", shared, dLhr, true);
    const mobile = mLhr ? litePass("mobile", shared, mLhr, false) : null;
    const notes = [...LITE_NOTES];
    if (shared.clientRendered) notes.push("The served HTML is a near-empty shell filled in by scripts; head and asset readings were not used for findings.");
    if (!desktopPsi.ok) notes.push(`Desktop PageSpeed run failed: ${desktopPsi.error}`);
    if (!mobilePsi.ok) notes.push(`Mobile PageSpeed run failed: ${mobilePsi.error}`);

    const truncation: string[] = [];
    if (desktop.html.truncated) truncation.push("passes.desktop.html");
    if (desktop.network.truncated) truncation.push("passes.desktop.network");
    if (fetched.some((f) => f.truncated)) truncation.push("sourceMaps.sources");

    const draft: EvidenceDoc = {
      version: EVIDENCE_VERSION,
      scanId: scan.id,
      requestedUrl: scan.url,
      collectedAt: isoUtc(),
      durationMs: Date.now() - started,
      scanner: { version: cfg.version, userAgent: cfg.userAgent },
      truncated: truncation.length > 0,
      truncation,
      passes: { desktop, mobile },
      mobileError: mobilePsi.ok ? null : mobilePsi.error.slice(0, 500),
      thirdParties: groupThirdParties(desktop.network.entries),
      wellKnown,
      sourceMaps: buildSourceMaps(referenced, fetched),
      tls: buildTls(await tlsP),
      dns: await dnsP,
      lighthouse,
      screenshots: shots,
      blockedRequests: blocks.slice(0, 200).map((b) => ({ host: b.host.slice(0, 256), reason: b.reason.slice(0, 200), phase: b.phase })),
      collection: { mode: "lite", notes: notes.map((n) => n.slice(0, 500)) },
    };
    const { doc, json } = enforceSize(EvidenceDocSchema.parse(draft));
    const evidencePath = storageKeyFor(scan.id, "evidence.json");
    await db.upload(evidencePath, json, "application/json");
    await ctx.progress(MILESTONES.upload);

    ctx.evidence = doc;
    ctx.evidencePath = evidencePath;
    ctx.summary = summarize(doc);
    log.info({ ms: Date.now() - started, requests: doc.passes.desktop.network.totalRequests, lighthouse: doc.lighthouse.status, bytes: Buffer.byteLength(json) }, "evidence collected (lite)");
  } finally {
    await fetcher.close().catch(() => undefined);
    await guard.stop().catch(() => undefined);
  }
}
