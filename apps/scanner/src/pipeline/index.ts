import { ScanResultSchema, summarizeAnalysis } from "@red/shared";
import { collect } from "./collect";
import { collectLite } from "./collectLite";
import type { Stage, StageContext } from "./types";
import { ScanFailure } from "../errors";
import { analyzeStage, compressStage, fingerprintStage } from "../analysis/stages";

/**
 * The ordered pipeline. Collection runs under "collecting"; fingerprint,
 * compress and analyze under "analyzing" (progress restarts at 0 there).
 * A failure in an "analyzing" stage keeps the quota charge (see fail_scan).
 */
export const STAGES: Stage[] = [
  { name: "collect", status: "collecting", run: (ctx) => (ctx.cfg.SCANNER_MODE === "lite" ? collectLite(ctx) : collect(ctx)) },
  { name: "fingerprint", status: "analyzing", run: fingerprintStage },
  { name: "compress", status: "analyzing", run: compressStage },
  { name: "analyze", status: "analyzing", run: analyzeStage },
];

export async function runPipeline(ctx: StageContext, stages: Stage[] = STAGES): Promise<unknown> {
  let current: Stage["status"] = "collecting";
  for (const stage of stages) {
    if (stage.status !== current) {
      // Status change is itself a real milestone the UI shows.
      const owned = await ctx.db.progress(ctx.scan.id, 0, stage.status);
      if (!owned) throw new ScanFailure("lost", "Scan was reassigned");
      current = stage.status;
      ctx.phaseChanged?.();
    }
    ctx.log.info({ stage: stage.name }, "stage start");
    await stage.run(ctx);
  }
  if (!ctx.summary || !ctx.evidencePath || !ctx.evidence) throw new Error("pipeline finished without evidence");
  return ScanResultSchema.parse({
    scannerVersion: ctx.cfg.version,
    collectedAt: ctx.evidence.collectedAt,
    evidencePath: ctx.evidencePath,
    summary: ctx.summary,
    analysis: ctx.analysis && ctx.analysisPath ? summarizeAnalysis(ctx.analysis, ctx.analysisPath) : null,
  });
}
