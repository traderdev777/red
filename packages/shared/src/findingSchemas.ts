import { z } from "zod";

/** Finding and evidence schemas, shared by schemas.ts and analysis.ts. */

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

