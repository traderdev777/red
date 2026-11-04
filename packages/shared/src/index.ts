/**
 * Shared domain types for RED.
 *
 * A Scan analyzes one URL. It produces Findings. Every Finding is backed by
 * Evidence and carries a Confidence. Nothing in RED is asserted without both.
 */

/** How a claim was established. Maps 1:1 to the Detected / Inferred / Risk badges. */
export type ConfidenceKind = "detected" | "inferred" | "risk";

export interface Confidence {
  /** detected = observed directly; inferred = derived from signals; risk = a liability. */
  kind: ConfidenceKind;
  /** 0-100. Detected findings should sit at 90+; inferred findings must justify their score. */
  score: number;
  /** One sentence on why the score is what it is. Shown in the ConfidenceMeter tooltip. */
  rationale: string;
}

export type EvidenceSource =
  | "html"
  | "http-header"
  | "network-request"
  | "script"
  | "stylesheet"
  | "dom-snapshot"
  | "screenshot"
  | "lighthouse"
  | "dns"
  | "model";

export interface Evidence {
  id: string;
  source: EvidenceSource;
  /** Exact URL the evidence was read from. */
  url: string;
  /** Raw excerpt, kept verbatim. Rendered in mono. */
  excerpt: string;
  /** CSS selector, header name, or byte range that locates the excerpt. */
  locator?: string;
  /** Storage key for a screenshot crop, when source is "screenshot". */
  screenshotKey?: string;
  capturedAt: string; // ISO 8601
}

export type FindingCategory =
  | "stack"
  | "performance"
  | "accessibility"
  | "seo"
  | "security"
  | "content"
  | "design"
  | "conversion";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

/** A concrete, buildable next step derived from a Finding. */
export interface BuildAction {
  id: string;
  title: string;
  /** What to change, written for an engineer. */
  instruction: string;
  /** Optional patch or snippet. Rendered in CodeBlock. */
  code?: { language: string; source: string };
  effort: "minutes" | "hours" | "days";
}

export interface Finding {
  id: string;
  scanId: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  summary: string;
  confidence: Confidence;
  evidence: Evidence[];
  actions: BuildAction[];
}

/** Lifecycle, exactly as stored in public.scans.status. */
export type ScanStatus = "queued" | "collecting" | "analyzing" | "done" | "failed";

/** What a finished scan stores in public.scans.result. */
export interface ScanResult {
  findings: Finding[];
  /** Scanner version that produced the result, for cache invalidation. */
  scannerVersion: string;
}

export interface Scan {
  id: string;
  userId: string;
  url: string;
  normalizedUrl: string;
  urlHash: string;
  status: ScanStatus;
  /** 0-100, written only by the scanner. */
  progress: number;
  error: string | null;
  result: ScanResult | null;
  /** Set when this scan reused a finished scan of the same URL from the last 7 days. */
  cachedFrom: string | null;
  retryOf: string | null;
  attempt: number;
  createdAt: string;
  finishedAt: string | null;
}

/** Clamp a raw score into the 0-100 range the UI expects. */
export function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

export * from "./url";
export * from "./normalize";
export * from "./schemas";
