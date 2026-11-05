import { loadConfig } from "./config";
import { Db } from "./db";
import { log } from "./log";
import { Worker } from "./worker";
import { startHealth } from "./health";

const cfg = loadConfig();
if (cfg.SCANNER_UPSTREAM_PROXY) {
  log.warn("SCANNER_UPSTREAM_PROXY is set: egress is chained through another proxy, so DNS pinning is weaker. Development only.");
}
const db = new Db(cfg);
const worker = new Worker(cfg, db);
const health = startHealth(cfg.PORT, db, worker);
worker.start();
log.info({ port: cfg.PORT, user_agent: cfg.userAgent }, "red-scanner up");

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, "shutting down: no new claims, finishing in-flight scans");
  await worker.stop();
  health.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (e) => log.error({ err: String(e) }, "unhandled rejection"));
