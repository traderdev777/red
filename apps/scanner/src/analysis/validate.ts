/**
 * Turns the model's reply into findings RED will stand behind. Anything that
 * cites an id not in the catalog, or states a number its cited evidence does
 * not contain, is dropped and counted in model.rejected.
 */
import { z } from "zod";
import type { Catalog } from "./catalog";
import type { ModelFinding, ModelReply } from "./gemini";

const Action = z.object({
  title: z.string().min(1).max(200),
  instruction: z.string().min(1).max(2000),
  effort: z.enum(["minutes", "hours", "days"]).catch("hours"),
  codeLanguage: z.string().max(32).optional(),
  code: z.string().max(4000).optional(),
});
const Finding = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1200),
  category: z.enum(["stack", "performance", "accessibility", "seo", "security", "content", "design", "conversion"]),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  kind: z.enum(["detected", "inferred", "risk"]),
  score: z.number(),
  rationale: z.string().min(1).max(500),
  evidenceIds: z.array(z.string()).max(12),
  actions: z.array(Action).max(4).catch([]),
});
const Reply = z.object({
  overview: z.string().max(1200).catch(""),
  priority: z.array(z.string()).max(80).catch([]),
  ruleActions: z.array(z.object({ ruleId: z.string(), actions: z.array(Action).max(3).catch([]) })).max(40).catch([]),
  findings: z.array(z.unknown()).max(20).catch([]),
});

/** Numbers as people write them: 2.5, 1,200, 45%, 3.9 s -> "2.5", "1200", "45", "3.9". Single digits are ignored. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\w])/g)]
    .map((m) => m[1]!.replace(/,/g, ""))
    .filter((n) => n.replace(".", "").length >= 2);
}

/** Every 2+ digit number in `claim` must appear in `evidence` (after removing thousands separators). */
export function numbersSupported(claim: string, evidence: string): boolean {
  const ev = new Set(numbersIn(evidence));
  const evFlat = evidence.replace(/(\d),(\d{3})/g, "$1$2");
  return numbersIn(claim).every((n) => ev.has(n) || evFlat.includes(n));
}

export interface Validated {
  overview: string | null;
  priority: string[];
  ruleActions: Map<string, ModelFinding["actions"]>;
  findings: ModelFinding[];
  rejected: number;
}

export function validateReply(raw: unknown, cat: Catalog, ruleIds: Set<string>, ruleEvidence: Map<string, Set<string>>): Validated {
  const r = Reply.parse(raw ?? {}) as Omit<ModelReply, "findings"> & { findings: unknown[] };
  let rejected = 0;
  const allText = [...cat.values()].map((e) => e.excerpt).join("\n");
  const findings: ModelFinding[] = [];
  for (const f of r.findings) {
    const p = Finding.safeParse(f);
    if (!p.success) {
      rejected++;
      continue;
    }
    const ids = [...new Set(p.data.evidenceIds.filter((id) => cat.has(id)))];
    if (!ids.length || ids.length < p.data.evidenceIds.length / 2) {
      rejected++;
      continue;
    }
    const cited = ids.map((id) => `${cat.get(id)!.excerpt} ${cat.get(id)!.url}`).join("\n");
    if (!numbersSupported(`${p.data.title} ${p.data.summary}`, cited)) {
      rejected++;
      continue;
    }
    // Duplicate of a rule finding: same evidence, nothing new.
    const dup = [...ruleEvidence.values()].some((ev) => ids.every((id) => ev.has(id)));
    if (dup) {
      rejected++;
      continue;
    }
    const kind = p.data.kind;
    const score = Math.round(Math.max(0, Math.min(kind === "inferred" ? 80 : 95, p.data.score)));
    findings.push({ ...p.data, evidenceIds: ids, score, actions: p.data.actions.filter((a) => a.instruction.trim()) });
    if (findings.length >= 8) break;
  }
  const ruleActions = new Map<string, ModelFinding["actions"]>();
  for (const ra of r.ruleActions) {
    if (ruleIds.has(ra.ruleId) && ra.actions.length) ruleActions.set(ra.ruleId, ra.actions.slice(0, 2));
  }
  const overview = r.overview && numbersSupported(r.overview, allText) ? r.overview.trim() : null;
  return { overview, priority: r.priority, ruleActions, findings, rejected };
}
