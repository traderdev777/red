import type { EvidenceDoc, EvidenceSummary, Finding } from "@red/shared";
import type { Config } from "../config";
import type { ClaimedScan, Db } from "../db";
import type { Log } from "../log";

export interface StageContext {
  scan: ClaimedScan;
  cfg: Config;
  db: Db;
  log: Log;
  /** Reports a real milestone. Throws ScanFailure("lost") if the scan was taken from us. */
  progress: (p: number) => Promise<void>;
  /** Called when the scan is aborted (timeout, shutdown) so a stage can release resources. */
  onAbort: (fn: () => void) => void;
  // Filled by stages, in order.
  evidence?: EvidenceDoc;
  evidencePath?: string;
  summary?: EvidenceSummary;
  /** Fingerprint stage output (Prompt 5). */
  fingerprint?: unknown;
  /** Analysis stage output (Prompt 5). null until that stage exists. */
  analysis?: { findings: Finding[] } | null;
}

/**
 * A pipeline stage. Stages run in order; each declares the scans.status it
 * runs under. Adding fingerprinting and analysis = appending two stages.
 */
export interface Stage {
  name: string;
  status: "collecting" | "analyzing";
  run: (ctx: StageContext) => Promise<void>;
}
