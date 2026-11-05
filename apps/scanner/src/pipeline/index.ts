import { ScanResultSchema } from "@red/shared";
import { collect } from "./collect";
import type { Stage, StageContext } from "./types";
import { ScanFailure } from "../errors";

/**
 * The ordered pipeline. Prompt 5 appends:
 *   { name: "fingerprint", status: "analyzing", run: fingerprint },
 *   { name: "analyze",     status: "analyzing", run: analyze },
 * A failure in an "analyzing" stage keeps the quota charge (see fail_scan).
 */
export const STAGES: Stage[] = [{ name: "collect", status: "collecting", run: (ctx) => collect(ctx) }];

export async function runPipeline(ctx: StageContext, stages: Stage[] = STAGES): Promise<unknown> {
  let current: Stage["status"] = "collecting";
  for (const stage of stages) {
    if (stage.status !== current) {
      // Status change is itself a real milestone the UI shows.
      const owned = await ctx.db.progress(ctx.scan.id, 0, stage.status);
      if (!owned) throw new ScanFailure("lost", "Scan was reassigned");
      current = stage.status;
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
    analysis: ctx.analysis ?? null,
  });
}
