import type { Analysis, Finding } from "@red/shared";

export const SEVERITY_ORDER: Finding["severity"][] = ["critical", "high", "medium", "low", "info"];

export function severityCounts(findings: Finding[]) {
  return SEVERITY_ORDER.map((s) => [s, findings.filter((f) => f.severity === s).length] as const).filter(([, n]) => n > 0);
}

export function modelLine(a: Analysis): string {
  const m = a.model;
  const fromModel = a.findings.filter((f) => f.id.startsWith("model.")).length;
  if (m.status === "ok") {
    return `Rules plus ${m.model}: ${fromModel} model finding${fromModel === 1 ? "" : "s"} kept${m.rejected ? `, ${m.rejected} rejected for missing or unverifiable evidence` : ""}.`;
  }
  if (m.status === "not_configured") return "Rule findings only. The model is not configured for this scanner.";
  if (m.status === "failed") return `Rule findings only. The model call failed: ${m.reason ?? "unknown error"}.`;
  return "Rule findings only.";
}

/** Markdown export. Everything comes from the stored analysis; nothing is added. */
export function reportMarkdown(url: string, finishedAt: string | null, a: Analysis): string {
  const out: string[] = [];
  out.push(`# RED report: ${url}`, "");
  if (finishedAt) out.push(`Scanned ${finishedAt}. ${modelLine(a)}`, "");
  if (a.overview) out.push(a.overview, "");
  if (a.technologies.length) {
    out.push("## Stack", "");
    for (const t of a.technologies) out.push(`- **${t.name}** (${t.category}, ${t.kind} ${t.score}): ${t.signals.join("; ")}`);
    out.push("");
  }
  out.push("## Findings", "");
  a.findings.forEach((f, i) => {
    out.push(`### ${i + 1}. ${f.title}`, "");
    out.push(`${f.severity.toUpperCase()} · ${f.category} · ${f.confidence.kind} ${f.confidence.score}/100`, "");
    out.push(f.summary, "", `_Confidence: ${f.confidence.rationale}_`, "");
    out.push("**Evidence**", "");
    for (const e of f.evidence) out.push(`- \`${e.id}\` (${e.source}${e.locator ? `, ${e.locator}` : ""}): ${e.excerpt.replace(/\n/g, " ")}`);
    out.push("");
    if (f.actions.length) {
      out.push("**Build actions**", "");
      for (const act of f.actions) {
        out.push(`- [ ] **${act.title}** (${act.effort}): ${act.instruction}`);
        if (act.code) out.push("", "```" + act.code.language, act.code.source, "```", "");
      }
      out.push("");
    }
  });
  return out.join("\n");
}
