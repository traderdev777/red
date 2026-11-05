import { Download } from "lucide-react";
import type { Analysis, Finding } from "@red/shared";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { modelLine, severityCounts } from "@/lib/report";

/**
 * The scan report: stack, findings, evidence, build actions. Server-rendered
 * from scans.result.analysis. Every finding shows the evidence it cites.
 */

const SEVERITY_TONE: Record<Finding["severity"], string> = {
  critical: "border-risk/60 text-risk",
  high: "border-risk/40 text-risk",
  medium: "border-inferred/40 text-inferred",
  low: "border-line text-chrome-300",
  info: "border-line text-chrome-500",
};
const CATEGORY_LABEL: Record<Finding["category"], string> = {
  stack: "Stack",
  performance: "Performance",
  accessibility: "Accessibility",
  seo: "SEO",
  security: "Security",
  content: "Content",
  design: "Design",
  conversion: "Conversion",
};

function SeverityTag({ s }: { s: Finding["severity"] }) {
  return (
    <span className={cn("text-step-n1 rounded-sm border px-2 py-0.5 font-mono uppercase", SEVERITY_TONE[s])}>{s}</span>
  );
}

function FindingCard({ f, n }: { f: Finding; n: number }) {
  const fromModel = f.id.startsWith("model.");
  return (
    <article id={`finding-${f.id}`} className="border-line bg-ink-950 flex flex-col gap-5 rounded-lg border p-5 md:p-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-step-n1 text-chrome-500 font-mono">{String(n).padStart(2, "0")}</span>
          <SeverityTag s={f.severity} />
          <span className="text-step-n1 text-chrome-500 font-mono">{CATEGORY_LABEL[f.category]}</span>
          <Badge kind={f.confidence.kind} />
          {fromModel && <span className="text-step-n1 text-chrome-500 font-mono">· model-written, evidence-checked</span>}
        </div>
        <h3 className="text-step-1 text-chrome-100">{f.title}</h3>
        <p className="text-step-0 text-chrome-300 max-w-[70ch]">{f.summary}</p>
      </header>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_14rem]">
        <details className="group min-w-0">
          <summary className="text-step-n1 text-chrome-300 hover:text-chrome-100 cursor-pointer font-mono">
            evidence · {f.evidence.length} item{f.evidence.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {f.evidence.map((e) => (
              <li key={e.id} className="border-line bg-ink-900 rounded-md border p-3">
                <p className="text-step-n1 text-chrome-500 font-mono break-all">
                  {e.id} · {e.source}
                  {e.locator ? ` · ${e.locator}` : ""}
                </p>
                <p className="text-step-n1 text-chrome-300 mt-1 font-mono break-words whitespace-pre-wrap">{e.excerpt}</p>
              </li>
            ))}
          </ul>
        </details>
        <ConfidenceMeter value={f.confidence.score} kind={f.confidence.kind} />
      </div>
      <p className="text-step-n1 text-chrome-500 font-mono">why this confidence: {f.confidence.rationale}</p>
      {f.actions.length > 0 && (
        <section aria-label="Build actions" className="border-line flex flex-col gap-4 border-t pt-4">
          <h4 className="text-step-n1 tracking-label text-chrome-500 font-mono uppercase">Build actions</h4>
          <ol className="flex flex-col gap-4">
            {f.actions.map((a) => (
              <li key={a.id} className="flex flex-col gap-2">
                <p className="text-step-0 text-chrome-100">
                  {a.title} <span className="text-step-n1 text-chrome-500 font-mono">· {a.effort}</span>
                </p>
                <p className="text-step-n1 text-chrome-300 max-w-[70ch]">{a.instruction}</p>
                {a.code && <CodeBlock code={a.code.source} language={a.code.language} showLineNumbers={false} wrap />}
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}

export function ReportPanel({ analysis, scanId }: { analysis: Analysis; scanId: string }) {
  const counts = severityCounts(analysis.findings);
  const byCat = Object.entries(
    analysis.findings.reduce<Record<string, number>>((m, f) => ((m[f.category] = (m[f.category] ?? 0) + 1), m), {}),
  );
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-step-2 text-chrome-100">Report</h2>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/app/scans/${scanId}/report?format=md`}
              className="border-line text-step-n1 text-chrome-300 hover:text-chrome-100 hover:border-chrome-500 duration-120 inline-flex h-9 items-center gap-2 rounded-md border px-3 font-mono transition-colors"
            >
              <Icon as={Download} size={16} /> Markdown
            </a>
            <a
              href={`/app/scans/${scanId}/report?format=json`}
              className="border-line text-step-n1 text-chrome-300 hover:text-chrome-100 hover:border-chrome-500 duration-120 inline-flex h-9 items-center gap-2 rounded-md border px-3 font-mono transition-colors"
            >
              <Icon as={Download} size={16} /> JSON
            </a>
          </div>
        </div>
        {analysis.overview && <p className="text-step-0 text-chrome-300 max-w-[70ch]">{analysis.overview}</p>}
        <p className="text-step-n1 text-chrome-500 font-mono">{modelLine(analysis)}</p>
        <dl
          className="border-line bg-line grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
          style={{ "--cols": counts.length + 1 } as React.CSSProperties}
        >
          <div className="bg-ink-950 p-4">
            <dt className="text-step-n1 text-chrome-500 font-mono">findings</dt>
            <dd className="text-step-2 text-chrome-100 font-mono">{analysis.findings.length}</dd>
          </div>
          {counts.map(([s, n]) => (
            <div key={s} className="bg-ink-950 p-4">
              <dt className="text-step-n1 text-chrome-500 font-mono">{s}</dt>
              <dd className={cn("text-step-2 font-mono", SEVERITY_TONE[s].split(" ").find((c) => c.startsWith("text-")))}>{n}</dd>
            </div>
          ))}
        </dl>
      </header>

      {analysis.technologies.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Detected stack">
          <h3 className="text-step-1 text-chrome-100">Stack</h3>
          <ul className="flex flex-wrap gap-2">
            {analysis.technologies.map((t) => (
              <li
                key={t.id}
                title={`${t.signals.join("; ")} (evidence: ${t.evidenceIds.join(", ")})`}
                className={cn(
                  "text-step-n1 flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono",
                  t.kind === "detected" ? "border-detected/30 text-chrome-100" : "border-inferred/40 text-chrome-100",
                )}
              >
                <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", t.kind === "detected" ? "bg-detected" : "bg-inferred")} />
                {t.name}
                <span className="text-chrome-500">
                  {t.category} · {t.kind} {t.score}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4" aria-label="Findings">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-step-1 text-chrome-100">Findings</h3>
          <p className="text-step-n1 text-chrome-500 font-mono">
            {byCat.map(([c, n]) => `${CATEGORY_LABEL[c as Finding["category"]]} ${n}`).join(" · ")}
          </p>
        </div>
        {analysis.findings.length === 0 ? (
          <p className="text-step-0 text-chrome-300">No issues met RED&rsquo;s evidence bar on this page.</p>
        ) : (
          analysis.findings.map((f, i) => <FindingCard key={f.id} f={f} n={i + 1} />)
        )}
      </section>
    </div>
  );
}
