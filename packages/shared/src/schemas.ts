import { z } from "zod";
import { EvidenceSummarySchema } from "./evidence";
import type { Scan } from "./index";

/** Runtime schemas mirroring the types in index.ts. Used at every trust boundary. */

export * from "./findingSchemas";
import { AnalysisSummarySchema } from "./analysis";

export const ScanStatusSchema = z.enum(["queued", "collecting", "analyzing", "done", "failed"]);

/**
 * public.scans.result. Collection fills `summary`; `analysis` stays null until
 * the fingerprint + model stages land, and will then carry the findings.
 */
export const ScanResultSchema = z.object({
  scannerVersion: z.string().min(1),
  collectedAt: z.string(),
  /** Key inside the private `evidence` bucket, e.g. "<scan_id>/evidence.json". */
  evidencePath: z.string().min(1),
  summary: EvidenceSummarySchema,
  analysis: AnalysisSummarySchema.nullable(),
});

export type ScanResultParsed = z.infer<typeof ScanResultSchema>;

/** A row of public.scans as PostgREST returns it (snake_case). */
export const ScanRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  url: z.string(),
  normalized_url: z.string(),
  url_hash: z.string().regex(/^[0-9a-f]{64}$/),
  status: ScanStatusSchema,
  progress: z.number().int().min(0).max(100),
  error: z.string().nullable(),
  result: ScanResultSchema.nullable().catch(null),
  cached_from: z.string().uuid().nullable(),
  retry_of: z.string().uuid().nullable().optional().default(null),
  attempt: z.number().int().optional().default(1),
  created_at: z.string(),
  started_at: z.string().nullable().optional().default(null),
  finished_at: z.string().nullable(),
});
export type ScanRow = z.infer<typeof ScanRowSchema>;

export function scanFromRow(row: ScanRow): Scan {
  return {
    id: row.id,
    userId: row.user_id,
    url: row.url,
    normalizedUrl: row.normalized_url,
    urlHash: row.url_hash,
    status: row.status,
    progress: row.progress,
    error: row.error,
    result: row.result,
    cachedFrom: row.cached_from,
    retryOf: row.retry_of ?? null,
    attempt: row.attempt ?? 1,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

/** Input to the startScan server action. */
export const StartScanInputSchema = z.object({
  url: z.string().trim().min(1, "Paste a URL to scan.").max(2048, "That URL is too long."),
});

export const ScanListQuerySchema = z.object({
  cursor: z
    .object({ createdAt: z.string().datetime({ offset: true }), id: z.string().uuid() })
    .nullable()
    .default(null),
  q: z.string().trim().max(200).default(""),
  status: z.union([ScanStatusSchema, z.literal("all")]).default("all"),
  limit: z.number().int().min(5).max(50).default(20),
});
