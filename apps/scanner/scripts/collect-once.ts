/** Dev: run the collect stage for one URL without a database. tsx scripts/collect-once.ts <url> */
import { collect } from "../src/pipeline/collect";
import { loadConfig } from "../src/config";
import { log } from "../src/log";
import type { StageContext } from "../src/pipeline/types";

const url = process.argv[2]!;
const cfg = loadConfig({ ...process.env, SUPABASE_URL: process.env.SUPABASE_URL ?? "http://127.0.0.1:1", SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "x".repeat(32), SCANNER_LIGHTHOUSE: process.env.SCANNER_LIGHTHOUSE ?? "off" });
const ctx: StageContext = {
  scan: { id: "00000000-0000-4000-8000-000000000001", user_id: "00000000-0000-4000-8000-000000000002", url, normalized_url: url, url_hash: "a".repeat(64), status: "collecting", attempt: 1, created_at: "" },
  cfg,
  db: { upload: async (p: string, b: Buffer | string) => console.error("upload", p, typeof b === "string" ? b.length : b.length) } as never,
  log,
  progress: async (p) => console.error("progress", p),
  onAbort: () => undefined,
};
try {
  await collect(ctx);
  const d = ctx.evidence!;
  console.log(JSON.stringify({ nav: d.passes.desktop.navigation, blocked: d.blockedRequests, title: d.passes.desktop.head.title, lighthouse: { status: d.lighthouse.status, reason: d.lighthouse.reason, scores: d.lighthouse.scores }, ms: d.durationMs }, null, 1));
} catch (e) {
  console.log("FAILED", (e as Error).name, (e as Error).message, JSON.stringify((e as { detail?: unknown }).detail));
}
process.exit(0);
