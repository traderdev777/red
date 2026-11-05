/**
 * Analysis contract: what the analysis stages write into scans.result.analysis.
 * Every Finding embeds the Evidence items it cites; every Evidence item was
 * built from evidence.json by the scanner, never written by the model.
 */
import { z } from "zod";
import { FindingSchema } from "./findingSchemas";

export const TechnologyCategorySchema = z.enum([
  "framework",
  "ui-library",
  "cms",
  "commerce",
  "site-builder",
  "hosting",
  "cdn",
  "web-server",
  "analytics",
  "tag-manager",
  "ads",
  "monitoring",
  "payments",
  "support",
  "consent",
  "fonts",
  "other",
]);

export const TechnologySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  category: TechnologyCategorySchema,
  /** "detected" = a direct signal (header, global, generator); "inferred" = indirect (ASN, URL pattern). */
  kind: z.enum(["detected", "inferred"]),
  score: z.number().int().min(0).max(100),
  /** Which signals matched, in words, e.g. "x-vercel-id header". */
  signals: z.array(z.string().max(200)).min(1).max(10),
  evidenceIds: z.array(z.string()).min(1).max(10),
});
export type Technology = z.infer<typeof TechnologySchema>;

export const ModelRunSchema = z.object({
  provider: z.literal("gemini"),
  model: z.string().nullable(),
  status: z.enum(["ok", "not_configured", "failed", "skipped"]),
  reason: z.string().max(500).nullable(),
  /** Findings the model proposed that were dropped by validation (uncited, unknown ids, unverifiable numbers). */
  rejected: z.number().int().nonnegative(),
  ms: z.number().int().nonnegative().nullable(),
  /** Whose key paid for the call. */
  keySource: z.enum(["user", "server"]).nullable().default(null),
});
export type ModelRun = z.infer<typeof ModelRunSchema>;

export const AnalysisSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  technologies: z.array(TechnologySchema).max(60),
  findings: z.array(FindingSchema).max(80),
  /** Short plain summary. Model-written when the model ran, else built from the rules. */
  overview: z.string().max(1200).nullable(),
  /** Finding ids, most important first. */
  priority: z.array(z.string()).max(80),
  model: ModelRunSchema,
  /** How many evidence items the analysis could cite from. */
  catalogSize: z.number().int(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;


/**
 * What scans.result.analysis holds: a small summary (Realtime pushes the whole
 * row on every update). The full Analysis lives in Storage at `analysisPath`.
 */
export const AnalysisSummarySchema = z.object({
  analysisPath: z.string().min(1),
  generatedAt: z.string(),
  findings: z.number().int().nonnegative(),
  bySeverity: z.record(z.enum(["critical", "high", "medium", "low", "info"]), z.number().int()),
  technologies: z.array(z.string().max(100)).max(60),
  overview: z.string().max(1200).nullable(),
  model: ModelRunSchema,
});
export type AnalysisSummary = z.infer<typeof AnalysisSummarySchema>;

export function summarizeAnalysis(a: Analysis, analysisPath: string): AnalysisSummary {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of a.findings) bySeverity[f.severity]++;
  return AnalysisSummarySchema.parse({
    analysisPath,
    generatedAt: a.generatedAt,
    findings: a.findings.length,
    bySeverity,
    technologies: a.technologies.map((t) => t.name),
    overview: a.overview,
    model: a.model,
  });
}
