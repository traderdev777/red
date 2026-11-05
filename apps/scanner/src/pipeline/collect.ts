/**
 * Collection stage: two viewport passes, site-level modules, Lighthouse,
 * screenshots, upload. Progress is reported only at real milestones.
 */
import { createServer } from "node:net";
import { chromium, type Browser } from "playwright";
import {
  EVIDENCE_LIMITS,
  EVIDENCE_VERSION,
  EvidenceDocSchema,
  EvidenceSummarySchema,
  storageKeyFor,
  type EvidenceDoc,
  type EvidenceSummary,
  type Pass,
} from "@red/shared";
import { assertPublicUrl } from "@red/shared/server";
import { ScanFailure, MESSAGES } from "../errors";
import { GuardProxy, type BlockEvent, type Resolve } from "../net/guardProxy";
import { GuardedFetcher } from "../net/fetcher";
import { isAllowed } from "../net/robots";
import { runPass, type RawPass } from "../collectors/pass";
import { buildNavigation } from "../collectors/navigation";
import { buildDocumentHeaders } from "../collectors/headers";
import { buildCookies } from "../collectors/cookies";
import { buildHead, buildHtml } from "../collectors/html";
import { buildAssets } from "../collectors/assets";
import { buildNetwork } from "../collectors/network";
import { buildRuntime } from "../collectors/runtime";
import { buildConsole } from "../collectors/console";
import { buildVitals } from "../collectors/vitals";
import { groupThirdParties } from "../collectors/thirdParties";
import { buildWellKnown, WELL_KNOWN_PATHS } from "../collectors/wellKnown";
import { buildSourceMaps, findReferences, summarizeMap } from "../collectors/sourcemaps";
import { buildTls, collectDns } from "../collectors/tlsDns";
import { runLighthouse, skippedLighthouse } from "../collectors/lighthouse";
import { hostOf, isoUtc } from "../collectors/util";
import type { StageContext } from "./types";

/** Real milestones and the progress each one is worth. Nothing else moves the bar. */
export const MILESTONES = {
  navigation: 10,
  settled: 30,
  probed: 45,
  mobile: 60,
  lighthouse: 80,
  upload: 95,
} as const;

async function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
  });
}

export function buildPass(raw: RawPass, siteHost: string, keepHtml: boolean): Pass {
  const network = buildNetwork(raw.network, siteHost);
  return {
    viewport: raw.viewport,
    navigation: buildNavigation(raw),
    document: buildDocumentHeaders(raw.headers),
    cookies: buildCookies(raw.cookies, siteHost),
    html: buildHtml(raw.html, keepHtml),
    head: buildHead(raw.head, raw.finalUrl),
    assets: buildAssets(raw.assets, network.entries, siteHost),
    network,
    runtime: buildRuntime(raw.runtime),
    console: buildConsole(raw.console),
    vitals: buildVitals(raw.vitals),
  };
}

export function summarize(doc: EvidenceDoc): EvidenceSummary {
  const d = doc.passes.desktop;
  const known = doc.thirdParties.filter((t) => t.vendor);
  return EvidenceSummarySchema.parse({
    finalUrl: d.navigation.finalUrl,
    status: d.navigation.status,
    redirects: d.navigation.redirectChain.length,
    timing: d.navigation.timing,
    vitals: { desktop: d.vitals, mobile: doc.passes.mobile?.vitals ?? null },
    requests: d.network.totalRequests,
    transferBytes: d.network.transferBytes,
    thirdParties: {
      count: doc.thirdParties.length,
      top: known.slice(0, 8).map((t) => ({ name: t.vendor!, category: t.category })),
    },
    cookies: { count: d.cookies.length, thirdParty: d.cookies.filter((c) => c.thirdParty).length },
    securityHeaders: d.document.security,
    lighthouse: { ...doc.lighthouse.scores, status: doc.lighthouse.status },
    tls: doc.tls ? { protocol: doc.tls.protocol, issuer: doc.tls.issuer } : null,
    sourceMapsReferenced: doc.sourceMaps.referenced.length,
    consoleErrors: d.console.errors.length,
    screenshots: doc.screenshots,
    truncated: doc.truncated,
  });
}

/** Keeps the evidence under EVIDENCE_LIMITS.evidenceBytes, dropping the bulkiest parts first. */
export function enforceSize(doc: EvidenceDoc): { doc: EvidenceDoc; json: string } {
  let json = JSON.stringify(doc);
  const steps: [string, (d: EvidenceDoc) => void][] = [
    ["passes.desktop.html.content", (d) => (d.passes.desktop.html.content = null)],
    ["passes.mobile.network.entries", (d) => d.passes.mobile && (d.passes.mobile.network.entries = d.passes.mobile.network.entries.slice(0, 50))],
    ["passes.*.head.jsonLd", (d) => {
      d.passes.desktop.head.jsonLd = d.passes.desktop.head.jsonLd.map((j) => ({ ...j, raw: "", truncated: true }));
      if (d.passes.mobile) d.passes.mobile.head.jsonLd = [];
    }],
    ["passes.desktop.network.entries", (d) => (d.passes.desktop.network.entries = d.passes.desktop.network.entries.slice(0, 150))],
  ];
  for (const [what, apply] of steps) {
    if (Buffer.byteLength(json) <= EVIDENCE_LIMITS.evidenceBytes) break;
    apply(doc);
    doc.truncated = true;
    if (!doc.truncation.includes(what)) doc.truncation.push(what);
    json = JSON.stringify(doc);
  }
  return { doc, json };
}

export interface CollectDeps {
  resolve?: Resolve;
  /** host:port fixture origins; honoured only when NODE_ENV === "test". */
  testAllow?: string[];
  launch?: (args: { proxy: string; cdpPort: number }) => Promise<Browser>;
}

export async function collect(ctx: StageContext, deps: CollectDeps = {}): Promise<void> {
  const { scan, cfg, db, log } = ctx;
  const started = Date.now();
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
  const checkNavigation = async (u: string) => {
    if (testAllowed(u)) return;
    await assertPublicUrl(u, deps.resolve);
  };

  // 0. The queued URL itself, re-checked with live DNS before anything connects.
  try {
    await checkNavigation(scan.url);
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
  const cdpPort = await freePort();
  const browser = await (deps.launch
    ? deps.launch({ proxy: guard.url, cdpPort })
    : chromium.launch({
        headless: true,
        executablePath: cfg.CHROMIUM_EXECUTABLE,
        args: [
          `--proxy-server=${guard.url}`,
          // Default Chrome bypasses the proxy for loopback; we want loopback blocked too.
          "--proxy-bypass-list=<-loopback>",
          `--remote-debugging-port=${cdpPort}`,
          "--remote-debugging-address=127.0.0.1",
          "--disable-quic",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-domain-reliability",
          "--disable-sync",
          "--no-first-run",
          "--no-default-browser-check",
          "--mute-audio",
        ],
      }));
  ctx.onAbort(() => void browser.close().catch(() => undefined));

  const deadline = started + cfg.SCAN_TIMEOUT_MS - 1_500;
  const siteHost = hostOf(scan.url);
  const step = (p: number) => ctx.progress(p);

  try {
    // 1. Desktop pass (navigation 10, settled 30, probed 45).
    const desktopRaw = await runPass({
      browser,
      url: scan.url,
      kind: "desktop",
      userAgent: cfg.userAgent,
      deadline,
      checkNavigation,
      guardBlocks: () => blocks.map((b) => ({ host: b.host, reason: b.reason })),
      onMilestone: (m) => step(MILESTONES[m]),
      testMode,
    });
    const finalHost = hostOf(desktopRaw.finalUrl) || siteHost;
    const origin = new URL(desktopRaw.finalUrl).origin;

    // 2. Site-level lookups run beside the mobile pass.
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

    // 3. Mobile pass (60). A bot wall or SSRF here fails the scan like on desktop.
    let mobileRaw: RawPass | null = null;
    let mobileError: string | null = null;
    if (deadline - Date.now() > 25_000) {
      try {
        mobileRaw = await runPass({
          browser,
          url: scan.url,
          kind: "mobile",
          userAgent: cfg.userAgent,
          deadline,
          checkNavigation,
          guardBlocks: () => blocks.map((b) => ({ host: b.host, reason: b.reason })),
          testMode,
        });
      } catch (e) {
        if (e instanceof ScanFailure && (e.kind === "ssrf" || e.kind === "bot_wall")) throw e;
        mobileError = (e as Error).message.slice(0, 500);
      }
    } else {
      mobileError = "Skipped: not enough of the 60 second budget left after the desktop pass.";
    }
    await step(MILESTONES.mobile);

    const wellKnown = await wellKnownP;
    const robots = wellKnown.find((w) => w.path === "/robots.txt");
    const robotsText = robots?.exists ? robots.head : null;

    // 4. Source maps the page references: at most 3, robots.txt permitting, file + sources only.
    const referenced = findReferences(desktopRaw.inspected);
    const fetchable = referenced.filter((r) => r.mapUrl.startsWith("http")).slice(0, EVIDENCE_LIMITS.sourceMapsFetched);
    const fetched = await Promise.all(
      fetchable.map(async (r) => {
        const path = new URL(r.mapUrl).pathname;
        if (hostOf(r.mapUrl) === finalHost && !isAllowed(robotsText, path)) {
          return summarizeMap(r.mapUrl, null, null, false, "disallowed by robots.txt");
        }
        if (deadline - Date.now() < 15_000) return summarizeMap(r.mapUrl, null, null, false, "skipped: time budget");
        try {
          const res = await fetcher.get(r.mapUrl, EVIDENCE_LIMITS.resourceInspectBytes, 5_000);
          return summarizeMap(r.mapUrl, res.status, res.status < 400 ? res.body.toString("utf8") : null, res.truncated, res.status >= 400 ? `HTTP ${res.status}` : null);
        } catch (e) {
          return summarizeMap(r.mapUrl, null, null, false, (e as Error).message.slice(0, 200));
        }
      }),
    );

    // 5. Lighthouse on the same Chrome (80). Failure is recorded, not fatal.
    const lhBudget = deadline - Date.now() - 6_000;
    const lighthouse =
      cfg.SCANNER_LIGHTHOUSE === "off"
        ? skippedLighthouse("skipped", "Disabled by SCANNER_LIGHTHOUSE=off")
        : lhBudget < 12_000
          ? skippedLighthouse("skipped", `Not enough of the ${Math.round(cfg.SCAN_TIMEOUT_MS / 1000)}s budget left (${Math.max(0, Math.round(lhBudget / 1000))}s)`)
          : await runLighthouse(desktopRaw.finalUrl, cdpPort, cfg.userAgent, Math.min(lhBudget, 35_000));
    await step(MILESTONES.lighthouse);

    // 6. Screenshots to the private bucket.
    const shots = { desktop: null as string | null, mobile: null as string | null };
    if (desktopRaw.screenshot) {
      shots.desktop = storageKeyFor(scan.id, "desktop.jpg");
      await db.upload(shots.desktop, desktopRaw.screenshot, "image/jpeg");
    }
    if (mobileRaw?.screenshot) {
      shots.mobile = storageKeyFor(scan.id, "mobile.jpg");
      await db.upload(shots.mobile, mobileRaw.screenshot, "image/jpeg");
    }

    const desktop = buildPass(desktopRaw, finalHost, true);
    const mobile = mobileRaw ? buildPass(mobileRaw, finalHost, false) : null;
    const truncation: string[] = [];
    if (desktop.html.truncated) truncation.push("passes.desktop.html");
    if (desktop.network.truncated) truncation.push("passes.desktop.network");
    if (mobile?.network.truncated) truncation.push("passes.mobile.network");
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
      mobileError,
      thirdParties: groupThirdParties(desktop.network.entries),
      wellKnown,
      sourceMaps: buildSourceMaps(referenced, fetched),
      tls: buildTls(desktopRaw.security),
      dns: await dnsP,
      lighthouse,
      screenshots: shots,
      blockedRequests: blocks.slice(0, 200).map((b) => ({ host: b.host.slice(0, 256), reason: b.reason.slice(0, 200), phase: b.phase })),
    };
    const { doc, json } = enforceSize(EvidenceDocSchema.parse(draft));

    // 7. Full evidence to Storage (95).
    const evidencePath = storageKeyFor(scan.id, "evidence.json");
    await db.upload(evidencePath, json, "application/json");
    await step(MILESTONES.upload);

    ctx.evidence = doc;
    ctx.evidencePath = evidencePath;
    ctx.summary = summarize(doc);
    log.info(
      { ms: Date.now() - started, requests: doc.passes.desktop.network.totalRequests, lighthouse: doc.lighthouse.status, blocked: blocks.length, bytes: Buffer.byteLength(json) },
      "evidence collected",
    );
  } finally {
    await browser.close().catch(() => undefined);
    await fetcher.close().catch(() => undefined);
    await guard.stop().catch(() => undefined);
  }
}
