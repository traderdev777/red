/**
 * Analysis stages: fingerprint -> compress -> analyze. All run under status
 * "analyzing". The model is optional: without a key, or if it fails, the scan
 * still finishes with the rule findings and the reason is recorded.
 */
import { createHash } from "node:crypto";
import { open as openSecret } from "@red/shared/server";
import { AnalysisSchema, storageKeyFor, type Analysis, type BuildAction, type Finding, type Technology } from "@red/shared";
import { buildCatalog, type Catalog } from "./catalog";
import { fingerprint } from "./fingerprint";
import { runRules, type RuleFinding } from "./rules";
import { callGemini, type ModelFinding } from "./gemini";
import { validateReply } from "./validate";
import { analysisView, type AnalysisView } from "./view";
import { isoUtc } from "../collectors/util";
import type { StageContext } from "../pipeline/types";

export const ANALYSIS_MILESTONES = { fingerprint: 20, compress: 40, model: 50, modelDone: 85, stored: 95 } as const;

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;

interface AnalysisState {
  catalog: Catalog;
  technologies: Technology[];
  rules: RuleFinding[];
  prompt?: string;
  view: AnalysisView;
}
const state = new WeakMap<StageContext, AnalysisState>();

export async function fingerprintStage(ctx: StageContext) {
  const view = analysisView(ctx.evidence!);
  const doc = view.doc;
  const catalog = buildCatalog(doc, view.unavailable, view.fromMobile);
  const technologies = fingerprint(doc, catalog);
  state.set(ctx, { catalog, technologies, rules: [], view });
  ctx.fingerprint = technologies;
  ctx.log.info({ technologies: technologies.map((t) => t.name), catalog: catalog.size }, "fingerprint done");
  await ctx.progress(ANALYSIS_MILESTONES.fingerprint);
}

export function buildPrompt(doc: NonNullable<StageContext["evidence"]>, s: AnalysisState): string {
  const lines: string[] = [];
  lines.push(`SITE: ${doc.passes.desktop.navigation.finalUrl}`);
  lines.push(`COLLECTED: ${doc.collectedAt} by ${doc.scanner.userAgent}`);
  lines.push("", "DETECTED STACK (deterministic):");
  for (const t of s.technologies) lines.push(`- ${t.name} [${t.category}, ${t.kind} ${t.score}] signals: ${t.signals.join("; ")} | ids: ${t.evidenceIds.join(", ")}`);
  lines.push("", "RULE FINDINGS (already reported; do not duplicate):");
  for (const r of s.rules) lines.push(`- ${r.ruleId}: ${r.title} | ids: ${r.evidenceIds.join(", ")}`);
  lines.push("", "EVIDENCE CATALOG (id | source | excerpt):");
  let budget = 60_000;
  for (const e of s.catalog.values()) {
    if (e.source === "screenshot") continue;
    const line = `${e.id} | ${e.source} | ${e.excerpt.slice(0, 320).replace(/\s+/g, " ")}`;
    budget -= line.length;
    if (budget < 0) {
      lines.push("(catalog truncated for length)");
      break;
    }
    lines.push(line);
  }
  lines.push("", "Return JSON per the schema. Cite catalog ids exactly.");
  return lines.join("\n");
}

export async function compressStage(ctx: StageContext) {
  const s = state.get(ctx)!;
  s.rules = runRules(s.view.doc, s.catalog, s.technologies, s.view.unavailable);
  s.prompt = buildPrompt(s.view.doc, s);
  ctx.log.info({ rules: s.rules.length, promptChars: s.prompt.length }, "compress done");
  await ctx.progress(ANALYSIS_MILESTONES.compress);
}

function toFinding(scanId: string, id: string, f: Omit<RuleFinding, "ruleId" | "actions"> & { actions: (Omit<BuildAction, "id"> | ModelFinding["actions"][number])[] }, cat: Catalog): Finding {
  return {
    id,
    scanId,
    category: f.category,
    severity: f.severity,
    title: f.title,
    summary: f.summary,
    confidence: { kind: f.kind, score: f.score, rationale: f.rationale },
    evidence: f.evidenceIds.map((e) => cat.get(e)!).filter(Boolean),
    actions: f.actions.map((a, i) => {
      const code = "code" in a && typeof a.code === "string" ? { language: ("codeLanguage" in a && a.codeLanguage) || "text", source: a.code } : "code" in a && a.code && typeof a.code === "object" ? a.code : undefined;
      return { id: `${id}.a${i + 1}`, title: a.title, instruction: a.instruction, effort: a.effort, ...(code ? { code } : {}) };
    }),
  };
}

function ruleOverview(findings: Finding[], tech: Technology[]): string {
  const count = (s: Finding["severity"]) => findings.filter((f) => f.severity === s).length;
  const top = findings.slice(0, 3).map((f) => f.title);
  const stack = tech.filter((t) => ["framework", "cms", "commerce", "site-builder", "hosting", "cdn"].includes(t.category)).map((t) => t.name);
  return [
    stack.length ? `Built with ${stack.join(", ")}.` : null,
    `${findings.length} findings: ${count("critical") + count("high")} high or critical, ${count("medium")} medium, ${count("low") + count("info")} low or informational.`,
    top.length ? `Start with: ${top.join("; ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function analyzeStage(ctx: StageContext) {
  const s = state.get(ctx)!;
  const scanId = ctx.scan.id;
  const ruleIds = new Set(s.rules.map((r) => r.ruleId));
  const ruleEvidence = new Map(s.rules.map((r) => [r.ruleId, new Set(r.evidenceIds)]));
  let model: Analysis["model"] = { provider: "gemini", model: ctx.cfg.GEMINI_MODEL, status: "not_configured", reason: "GEMINI_API_KEY is not set; rule findings only.", rejected: 0, ms: null, keySource: null };
  let modelFindings: ModelFinding[] = [];
  let overview: string | null = null;
  let priority: string[] = [];
  let ruleActions = new Map<string, ModelFinding["actions"]>();

  // The scan owner's own key wins over the server key.
  let apiKey = ctx.cfg.GEMINI_API_KEY ?? null;
  let keySource: "user" | "server" | null = apiKey ? "server" : null;
  const sealed = ctx.cfg.RED_SECRETS_KEY && ctx.db.userGeminiKey ? await ctx.db.userGeminiKey(ctx.scan.user_id).catch(() => null) : null;
  if (sealed) {
    try {
      apiKey = openSecret(sealed, ctx.cfg.RED_SECRETS_KEY);
      keySource = "user";
    } catch {
      ctx.log.warn("user Gemini key could not be decrypted; falling back to the server key");
    }
  }

  if (apiKey) {
    await ctx.progress(ANALYSIS_MILESTONES.model);
    try {
      const { reply, ms } = await callGemini(
        { apiKey, model: ctx.cfg.GEMINI_MODEL, timeoutMs: ctx.cfg.GEMINI_TIMEOUT_MS, proxy: ctx.cfg.SCANNER_UPSTREAM_PROXY ?? null },
        s.prompt!,
      );
      const v = validateReply(reply, s.catalog, ruleIds, ruleEvidence);
      modelFindings = v.findings;
      overview = v.overview;
      priority = v.priority;
      ruleActions = v.ruleActions;
      model = { provider: "gemini", model: ctx.cfg.GEMINI_MODEL, status: "ok", reason: null, rejected: v.rejected, ms, keySource };
      ctx.log.info({ ms, kept: modelFindings.length, rejected: v.rejected }, "model done");
    } catch (e) {
      model = { provider: "gemini", model: ctx.cfg.GEMINI_MODEL, status: "failed", reason: (e as Error).message.slice(0, 500), rejected: 0, ms: null, keySource };
      ctx.log.warn({ err: (e as Error).message }, "model failed; keeping rule findings");
    }
    await ctx.progress(ANALYSIS_MILESTONES.modelDone);
  }

  const findings: Finding[] = [
    ...s.rules.map((r) => toFinding(scanId, r.ruleId, { ...r, actions: [...r.actions, ...(ruleActions.get(r.ruleId) ?? [])] }, s.catalog)),
    // Content-addressed ids so a user's done/dismissed status survives a re-scan.
    ...modelFindings.map((f) => toFinding(scanId, `model.${createHash("sha1").update(`${f.category}|${f.title}`).digest("hex").slice(0, 12)}`, f, s.catalog)),
  ].filter((f) => f.evidence.length > 0);

  // Order: model priority when it named real ids/titles, then severity.
  const rank = new Map<string, number>();
  priority.forEach((p, i) => {
    const hit = findings.find((f) => f.id === p || f.title === p);
    if (hit && !rank.has(hit.id)) rank.set(hit.id, i);
  });
  findings.sort((a, b) => (rank.get(a.id) ?? 1000) - (rank.get(b.id) ?? 1000) || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.confidence.score - a.confidence.score);

  const analysis = AnalysisSchema.parse({
    version: 1,
    generatedAt: isoUtc(),
    technologies: s.technologies,
    findings,
    overview: overview ?? ruleOverview(findings, s.technologies),
    priority: findings.map((f) => f.id),
    model,
    catalogSize: s.catalog.size,
  });
  ctx.analysis = analysis;
  ctx.analysisPath = storageKeyFor(scanId, "analysis.json");
  await ctx.db.upload(ctx.analysisPath, JSON.stringify(analysis), "application/json");
  await ctx.db.indexFindings(scanId, analysis.findings);
  await ctx.progress(ANALYSIS_MILESTONES.stored);
}
