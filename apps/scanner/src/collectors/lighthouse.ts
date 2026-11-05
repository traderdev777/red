import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LighthouseSchema, type Lighthouse } from "@red/shared";

const CHILD = fileURLToPath(new URL("./lighthouse-child.mjs", import.meta.url));

export const KEY_AUDITS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "speed-index",
  "interactive",
  "server-response-time",
  "render-blocking-resources",
  "unused-javascript",
  "unused-css-rules",
  "uses-optimized-images",
  "modern-image-formats",
  "uses-text-compression",
  "uses-long-cache-ttl",
  "total-byte-weight",
  "dom-size",
  "bootup-time",
  "mainthread-work-breakdown",
  "third-party-summary",
  "color-contrast",
  "image-alt",
  "document-title",
  "meta-description",
  "is-crawlable",
  "errors-in-console",
  "csp-xss",
] as const;

interface LhrLike {
  lighthouseVersion?: string;
  runtimeError?: { code?: string; message?: string };
  categories?: Record<string, { score: number | null } | undefined>;
  audits?: Record<string, { title?: string; score?: number | null; displayValue?: string; numericValue?: number } | undefined>;
}

const pct = (s: number | null | undefined) => (s == null ? null : Math.round(s * 100));

export function skippedLighthouse(status: "failed" | "skipped", reason: string): Lighthouse {
  return LighthouseSchema.parse({
    status,
    reason: reason.slice(0, 500),
    version: null,
    formFactor: "mobile",
    scores: { performance: null, accessibility: null, bestPractices: null, seo: null },
    audits: [],
  });
}

export function buildLighthouse(lhr: LhrLike): Lighthouse {
  if (lhr.runtimeError?.code && lhr.runtimeError.code !== "NO_ERROR") {
    return skippedLighthouse("failed", `${lhr.runtimeError.code}: ${lhr.runtimeError.message ?? ""}`);
  }
  const c = lhr.categories ?? {};
  const audits = KEY_AUDITS.flatMap((id) => {
    const a = lhr.audits?.[id];
    if (!a) return [];
    return [
      {
        id,
        title: (a.title ?? id).slice(0, 300),
        score: a.score ?? null,
        displayValue: a.displayValue?.slice(0, 200) ?? null,
        numericValue: typeof a.numericValue === "number" ? Math.round(a.numericValue * 1000) / 1000 : null,
      },
    ];
  });
  return LighthouseSchema.parse({
    status: "ok",
    reason: null,
    version: lhr.lighthouseVersion ?? null,
    formFactor: "mobile",
    scores: {
      performance: pct(c["performance"]?.score),
      accessibility: pct(c["accessibility"]?.score),
      bestPractices: pct(c["best-practices"]?.score),
      seo: pct(c["seo"]?.score),
    },
    audits,
  });
}

/**
 * Runs Lighthouse (default mobile profile) against the scan's own Chrome, in a
 * child process so concurrent scans never share Lighthouse's global state.
 */
/**
 * One Lighthouse at a time per process: it is CPU-bound, and two audits
 * competing for the same cores produce slow runs and distorted scores.
 */
let lhBusy: Promise<void> = Promise.resolve();

export async function runLighthouse(url: string, port: number, userAgent: string, budgetMs: number): Promise<Lighthouse> {
  const started = Date.now();
  let release!: () => void;
  const prev = lhBusy;
  lhBusy = new Promise<void>((r) => (release = r));
  try {
    const waited = await Promise.race([prev.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), Math.max(0, budgetMs - 15_000)))]);
    if (!waited) return skippedLighthouse("skipped", "Another scan's Lighthouse audit was still running; not enough time left in this scan's budget");
    return await runChild(url, port, userAgent, budgetMs - (Date.now() - started));
  } finally {
    // Chain stays ordered even if we gave up waiting: the next caller waits for prev too.
    void prev.then(release);
  }
}

async function runChild(url: string, port: number, userAgent: string, budgetMs: number): Promise<Lighthouse> {
  const child = spawn(process.execPath, [CHILD, JSON.stringify({ url, port, userAgent, maxWaitForLoad: Math.max(10_000, budgetMs - 5_000) })], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
  const timer = setTimeout(() => child.kill("SIGKILL"), budgetMs);
  const code = await new Promise<number | null>((r) => child.on("close", r));
  clearTimeout(timer);
  const line = out.trim().split("\n").pop();
  if (!line) {
    return skippedLighthouse("failed", code === null ? `Lighthouse did not finish within ${Math.round(budgetMs / 1000)}s` : `Lighthouse exited (${code}): ${err.trim().slice(-300) || "no output"}`);
  }
  try {
    const parsed = JSON.parse(line) as { ok: boolean; error?: string; lhr?: LhrLike };
    if (!parsed.ok || !parsed.lhr) return skippedLighthouse("failed", parsed.error ?? "Lighthouse failed");
    return buildLighthouse(parsed.lhr);
  } catch {
    return skippedLighthouse("failed", "Lighthouse output was not readable");
  }
}
