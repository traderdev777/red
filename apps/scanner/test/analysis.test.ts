/**
 * Analysis stages against a real evidence.json (docs/samples) plus synthetic
 * model replies that try to cite unknown ids or invent numbers.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AnalysisSchema, EvidenceDocSchema } from "@red/shared";
import { buildCatalog } from "../src/analysis/catalog";
import { fingerprint } from "../src/analysis/fingerprint";
import { runRules } from "../src/analysis/rules";
import { numbersIn, numbersSupported, validateReply } from "../src/analysis/validate";
import { analyzeStage, compressStage, fingerprintStage } from "../src/analysis/stages";
import { log } from "../src/log";
import type { StageContext } from "../src/pipeline/types";

const doc = EvidenceDocSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/evidence.wordpress-news.json", import.meta.url), "utf8")));
const cat = buildCatalog(doc);
const tech = fingerprint(doc, cat);
const rules = runRules(doc, cat, tech);

describe("catalog", () => {
  it("builds stable, valid evidence items from evidence.json", () => {
    expect(cat.size).toBeGreaterThan(40);
    expect(cat.get("meta.generator")?.excerpt).toMatch(/WordPress/);
    expect(cat.get("hdr.server")?.source).toBe("http-header");
    for (const e of cat.values()) expect(() => new URL(e.url)).not.toThrow();
  });
  it("never carries cookie values", () => {
    for (const [id, e] of cat) if (id.startsWith("cookie.")) expect(e.excerpt).toMatch(/Value not recorded/);
  });
});

describe("fingerprint", () => {
  it("detects WordPress with direct signals and cites catalog ids", () => {
    const wp = tech.find((t) => t.id === "wordpress")!;
    expect(wp.kind).toBe("detected");
    expect(wp.score).toBeGreaterThanOrEqual(90);
    expect(wp.evidenceIds).toContain("meta.generator");
    for (const t of tech) for (const id of t.evidenceIds) expect(cat.has(id)).toBe(true);
  });
  it("does not claim frameworks with no signal", () => {
    expect(tech.find((t) => t.id === "nextjs")).toBeUndefined();
    expect(tech.find((t) => t.id === "shopify")).toBeUndefined();
  });
});

describe("rules", () => {
  it("every rule finding cites existing catalog items and states only evidenced numbers", () => {
    expect(rules.length).toBeGreaterThan(3);
    for (const r of rules) {
      expect(r.evidenceIds.length).toBeGreaterThan(0);
      for (const id of r.evidenceIds) expect(cat.has(id)).toBe(true);
    }
  });
  it("does not report headers that are present", () => {
    expect(rules.find((r) => r.ruleId === "security.hsts-missing")).toBeUndefined(); // wordpress.org sends HSTS
    expect(rules.find((r) => r.ruleId === "security.csp-missing")).toBeDefined();
  });
  it("gives stack-aware fixes (WordPress -> functions.php header)", () => {
    const csp = rules.find((r) => r.ruleId === "security.csp-missing")!;
    expect(csp.actions[0]!.code?.language).toBe("php");
  });
});

describe("model reply validation", () => {
  const ruleIds = new Set(rules.map((r) => r.ruleId));
  const ruleEvidence = new Map(rules.map((r) => [r.ruleId, new Set(r.evidenceIds)]));
  const base = { category: "performance", severity: "low", kind: "detected", score: 90, rationale: "r", actions: [] };

  it("numbers must appear in the cited evidence", () => {
    expect(numbersIn("LCP 2,500 ms and 45% of 3.9 s, 1 item")).toEqual(["2500", "45", "3.9"]);
    expect(numbersSupported("TTFB 267 ms", "GET x -> HTTP 200; TTFB 267 ms")).toBe(true);
    expect(numbersSupported("TTFB 900 ms", "TTFB 267 ms")).toBe(false);
  });
  it("drops uncited, fabricated-id, invented-number and duplicate findings; keeps a valid one", () => {
    const used = new Set(rules.flatMap((r) => r.evidenceIds));
    const lhId = [...cat.keys()].find((k) => k.startsWith("lh.") && k !== "lh.status" && !used.has(k))!;
    const v = validateReply(
      {
        overview: "The site loads 9999 requests.",
        priority: [],
        ruleActions: [{ ruleId: "security.csp-missing", actions: [{ title: "Use a nonce", instruction: "Add a nonce-based CSP.", effort: "hours" }] }, { ruleId: "not.a.rule", actions: [{ title: "x", instruction: "y", effort: "minutes" }] }],
        findings: [
          { ...base, title: "No citations", summary: "s", evidenceIds: [] },
          { ...base, title: "Made-up id", summary: "s", evidenceIds: ["hdr.x-made-up"] },
          { ...base, title: "Invented number", summary: "The page makes 777 requests.", evidenceIds: ["net.totals"] },
          { ...base, title: "Duplicate of a rule", summary: "No CSP.", evidenceIds: ["hdr-missing.content-security-policy"] },
          { ...base, title: "Valid, cited", summary: "Lighthouse flagged this audit.", evidenceIds: [lhId] },
        ],
      },
      cat,
      ruleIds,
      ruleEvidence,
    );
    expect(v.findings.map((f) => f.title)).toEqual(["Valid, cited"]);
    expect(v.rejected).toBe(4);
    expect(v.overview).toBeNull(); // 9999 is not in the evidence
    expect([...v.ruleActions.keys()]).toEqual(["security.csp-missing"]);
  });
});

describe("analysis stages without a model key", () => {
  it("produce a valid Analysis with rule findings and an honest model status", async () => {
    const progress: number[] = [];
    const uploads: string[] = [];
    const indexed: number[] = [];
    const ctx = {
      scan: { id: doc.scanId },
      cfg: { GEMINI_MODEL: "gemini-3.8-flash", GEMINI_API_KEY: undefined },
      db: { upload: async (path: string) => void uploads.push(path), indexFindings: async (_id: string, f: unknown[]) => void indexed.push(f.length) },
      log,
      evidence: doc,
      progress: async (p: number) => void progress.push(p),
      onAbort: () => {},
    } as unknown as StageContext;
    await fingerprintStage(ctx);
    await compressStage(ctx);
    await analyzeStage(ctx);
    const a = AnalysisSchema.parse(ctx.analysis);
    expect(a.model.status).toBe("not_configured");
    expect(a.findings.length).toBe(rules.length);
    expect(a.findings.every((f) => f.evidence.length > 0 && f.evidence.every((e) => cat.has(e.id)))).toBe(true);
    expect(progress).toEqual([20, 40, 95]);
    expect(uploads).toEqual([`${doc.scanId}/analysis.json`]);
    expect(indexed).toEqual([a.findings.length]);
  });
});

describe("busy pages: probes that timed out never become absence findings", () => {
  const blank = { title: null, description: null, canonical: null, generator: null, viewport: null, themeColor: null, manifest: null, lang: null, robots: null, og: {}, twitter: {}, jsonLd: [] };
  it("uses the mobile reading when only the desktop probe timed out", async () => {
    const { analysisView } = await import("../src/analysis/view");
    const d = structuredClone(doc);
    d.passes.desktop.head = blank;
    d.passes.desktop.incomplete = ["head"];
    d.passes.mobile = { ...structuredClone(doc.passes.desktop), incomplete: [] };
    const v = analysisView(d);
    expect(v.fromMobile.has("head")).toBe(true);
    const c = buildCatalog(v.doc, v.unavailable, v.fromMobile);
    const r = runRules(v.doc, c, fingerprint(v.doc, c), v.unavailable);
    expect(r.find((x) => x.ruleId === "seo.no-title")).toBeUndefined();
    expect(c.get("meta.title")!.excerpt).toMatch(/mobile pass/);
  });
  it("draws no head conclusions when neither pass answered", async () => {
    const { analysisView } = await import("../src/analysis/view");
    const d = structuredClone(doc);
    d.passes.desktop.head = blank;
    d.passes.desktop.incomplete = ["head"];
    d.passes.mobile = null;
    const v = analysisView(d);
    const c = buildCatalog(v.doc, v.unavailable, v.fromMobile);
    const r = runRules(v.doc, c, fingerprint(v.doc, c), v.unavailable);
    expect(r.filter((x) => x.ruleId.startsWith("seo.no-") || x.ruleId === "accessibility.no-lang")).toEqual(r.filter((x) => x.ruleId === "seo.no-sitemap"));
    expect(c.has("meta.title")).toBe(false);
    expect(c.get("probe.head")!.excerpt).toMatch(/did not answer/);
  });
});
