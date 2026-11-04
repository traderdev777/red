import { z } from "zod";
import type { Scan } from "./index";

/** Runtime schemas mirroring the types in index.ts. Used at every trust boundary. */

export const ConfidenceKindSchema = z.enum(["detected", "inferred", "risk"]);

export const ConfidenceSchema = z.object({
  kind: ConfidenceKindSchema,
  score: z.number().int().min(0).max(100),
  rationale: z.string().min(1).max(500),
});

export const EvidenceSourceSchema = z.enum([
  "html",
  "http-header",
  "network-request",
  "script",
  "stylesheet",
  "dom-snapshot",
  "screenshot",
  "lighthouse",
  "dns",
  "model",
]);

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  source: EvidenceSourceSchema,
  url: z.string().url(),
  excerpt: z.string().max(20_000),
  locator: z.string().max(1_000).optional(),
  screenshotKey: z.string().max(500).optional(),
  capturedAt: z.string().datetime(),
});

export const BuildActionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  instruction: z.string().min(1),
  code: z.object({ language: z.string().min(1).max(32), source: z.string() }).optional(),
  effort: z.enum(["minutes", "hours", "days"]),
});

export const FindingSchema = z.object({
  id: z.string().min(1),
  scanId: z.string().uuid(),
  category: z.enum([
    "stack",
    "performance",
    "accessibility",
    "seo",
    "security",
    "content",
    "design",
    "conversion",
  ]),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  title: z.string().min(1).max(200),
  summary: z.string().min(1),
  confidence: ConfidenceSchema,
  // A finding without evidence is not a finding.
  evidence: z.array(EvidenceSchema).min(1),
  actions: z.array(BuildActionSchema),
});

export const ScanStatusSchema = z.enum(["queued", "collecting", "analyzing", "done", "failed"]);

export const ScanResultSchema = z.object({
  findings: z.array(FindingSchema),
  scannerVersion: z.string().min(1),
});

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
