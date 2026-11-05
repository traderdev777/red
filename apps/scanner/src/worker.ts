import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Config } from "./config";
import type { ClaimedScan, Db } from "./db";
import { log, scanLog } from "./log";
import { runPipeline, STAGES } from "./pipeline";
import type { Stage, StageContext } from "./pipeline/types";
import { ScanFailure, MESSAGES } from "./errors";
import { isoUtc } from "./collectors/util";

export interface WorkerState {
  workerId: string;
  startedAt: string;
  running: boolean;
  draining: boolean;
  concurrency: number;
  active: { scanId: string; startedAt: string; progress: number }[];
  completed: number;
  failed: number;
  lastClaimAt: string | null;
  lastError: string | null;
  realtime: "connecting" | "subscribed" | "error" | "closed";
}

export class Worker {
  readonly state: WorkerState;
  private timer: NodeJS.Timeout | null = null;
  private reaper: NodeJS.Timeout | null = null;
  private channel: RealtimeChannel | null = null;
  private pumping = false;
  private inflight = new Map<string, Promise<void>>();
  private aborters = new Map<string, () => void>();

  constructor(
    private readonly cfg: Config,
    private readonly db: Db,
    private readonly stages: Stage[] = STAGES,
  ) {
    this.state = {
      workerId: cfg.workerId,
      startedAt: isoUtc(),
      running: false,
      draining: false,
      concurrency: cfg.SCAN_CONCURRENCY,
      active: [],
      completed: 0,
      failed: 0,
      lastClaimAt: null,
      lastError: null,
      realtime: "connecting",
    };
  }

  start() {
    this.state.running = true;
    this.timer = setInterval(() => void this.pump(), this.cfg.SCAN_POLL_MS);
    this.reaper = setInterval(() => void this.reap(), this.cfg.REAPER_INTERVAL_MS);
    // Realtime wake-up: a new queued scan triggers a claim attempt immediately.
    this.channel = this.db.client
      .channel(`scanner:${this.cfg.workerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scans" }, (p) => {
        if ((p.new as { status?: string }).status === "queued") void this.pump();
      })
      .subscribe((status) => {
        this.state.realtime = status === "SUBSCRIBED" ? "subscribed" : status === "CLOSED" ? "closed" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "error" : "connecting";
      });
    void this.reap();
    void this.pump();
    log.info({ worker_id: this.cfg.workerId, concurrency: this.cfg.SCAN_CONCURRENCY }, "worker started");
  }

  /** Stop claiming, let in-flight scans finish (each is capped at SCAN_TIMEOUT_MS). */
  async stop(graceMs = this.cfg.SCAN_TIMEOUT_MS + this.cfg.ANALYSIS_TIMEOUT_MS + 5_000) {
    this.state.draining = true;
    if (this.timer) clearInterval(this.timer);
    if (this.reaper) clearInterval(this.reaper);
    if (this.channel) await this.db.client.removeChannel(this.channel).catch(() => undefined);
    const all = Promise.allSettled([...this.inflight.values()]);
    const timedOut = await Promise.race([all.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), graceMs))]);
    if (timedOut) for (const abort of this.aborters.values()) abort();
    this.state.running = false;
    log.info({ worker_id: this.cfg.workerId, timedOut }, "worker stopped");
  }

  private async reap() {
    try {
      const ids = await this.db.reap(this.cfg.REAPER_TIMEOUT_S);
      for (const id of ids) scanLog(id).warn({ reason: "stuck" }, "scan reaped: Scanner timed out, quota refunded if charged");
    } catch (e) {
      this.state.lastError = (e as Error).message;
      log.error({ err: (e as Error).message }, "reaper failed");
    }
  }

  /** Claims until the concurrency slots are full or the queue is empty. */
  async pump() {
    if (this.pumping || this.state.draining) return;
    this.pumping = true;
    try {
      while (!this.state.draining && this.inflight.size < this.cfg.SCAN_CONCURRENCY) {
        const scan = await this.db.claim();
        if (!scan) break;
        this.state.lastClaimAt = isoUtc();
        const p = this.process(scan).finally(() => {
          this.inflight.delete(scan.id);
          this.aborters.delete(scan.id);
          this.state.active = this.state.active.filter((a) => a.scanId !== scan.id);
          void this.pump();
        });
        this.inflight.set(scan.id, p);
      }
    } catch (e) {
      this.state.lastError = (e as Error).message;
      log.error({ err: (e as Error).message }, "claim failed");
    } finally {
      this.pumping = false;
    }
  }

  private async process(scan: ClaimedScan) {
    const slog = scanLog(scan.id, { worker_id: this.cfg.workerId });
    const entry = { scanId: scan.id, startedAt: isoUtc(), progress: 0 };
    this.state.active.push(entry);
    const abortFns: (() => void)[] = [];
    let lost = false;
    const ctx: StageContext = {
      scan,
      cfg: this.cfg,
      db: this.db,
      log: slog,
      onAbort: (fn) => abortFns.push(fn),
      phaseChanged: () => {
        entry.progress = 0;
      },
      progress: async (p) => {
        if (p <= entry.progress) return;
        entry.progress = p;
        const owned = await this.db.progress(scan.id, p);
        slog.info({ progress: p }, "milestone");
        if (!owned) {
          lost = true;
          throw new ScanFailure("lost", "Scan was reaped or reassigned");
        }
      },
    };
    const abort = () => abortFns.forEach((f) => f());
    this.aborters.set(scan.id, abort);

    slog.info({ url_hash: scan.url_hash, attempt: scan.attempt }, "scan claimed");
    let timer: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        runPipeline(ctx, this.stages),
        new Promise<never>((_, rej) => {
          timer = setTimeout(() => {
            abort();
            rej(new ScanFailure("timeout", MESSAGES.timeout));
          }, this.cfg.SCAN_TIMEOUT_MS + this.cfg.ANALYSIS_TIMEOUT_MS);
        }),
      ]);
      const ok = await this.db.complete(scan.id, result);
      if (ok) {
        this.state.completed++;
        slog.info("scan done");
      } else slog.warn("scan finished but was no longer ours; result discarded");
    } catch (e) {
      const f = e instanceof ScanFailure ? e : null;
      if (f?.kind === "lost" || lost) {
        slog.warn("scan lost (reaped or reassigned); stopping");
        return;
      }
      const crashed = /Target (page, context or browser )?(has been )?closed|Browser has been closed|browser has disconnected/i.test(String((e as Error)?.message));
      const analyzing = (await this.db.client.from("scans").select("status").eq("id", scan.id).maybeSingle()).data?.status === "analyzing";
      const message = f
        ? f.message
        : crashed
          ? "The scanner's browser stopped unexpectedly. No quota was used."
          : analyzing
            ? "The scanner hit an internal error during analysis."
            : MESSAGES.internal;
      this.state.failed++;
      slog[f ? "warn" : "error"]({ kind: f?.kind ?? "internal", err: (e as Error).message, detail: f?.detail }, "scan failed");
      try {
        if (f?.kind === "ssrf") await this.db.audit(scan, "scan.blocked_ssrf", f.detail);
        if (f?.kind === "bot_wall") await this.db.audit(scan, "scan.blocked_bot_wall", f.detail);
      } catch (ae) {
        slog.error({ err: (ae as Error).message }, "audit write failed");
      }
      await this.db.fail(scan.id, message).catch((fe) => slog.error({ err: (fe as Error).message }, "fail_scan failed"));
    } finally {
      if (timer) clearTimeout(timer);
      abort();
    }
  }
}
