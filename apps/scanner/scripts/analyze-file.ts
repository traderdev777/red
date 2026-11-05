/** Dev: run fingerprint + rules (+ Gemini if GEMINI_API_KEY) on an evidence.json. tsx scripts/analyze-file.ts <path> */
import { readFileSync } from "node:fs";
import { EvidenceDocSchema } from "@red/shared";
import { fingerprintStage, compressStage, analyzeStage } from "../src/analysis/stages";
import { loadConfig } from "../src/config";
import { log } from "../src/log";
import type { StageContext } from "../src/pipeline/types";

const doc = EvidenceDocSchema.parse(JSON.parse(readFileSync(process.argv[2]!, "utf8")));
const cfg = loadConfig({ ...process.env, SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_SERVICE_ROLE_KEY: "x".repeat(32) });
const ctx = { scan: { id: doc.scanId }, cfg, log, evidence: doc, db: { upload: async () => {}, indexFindings: async () => {} }, progress: async (p: number) => console.error("progress", p), onAbort: () => {} } as unknown as StageContext;
await fingerprintStage(ctx);
await compressStage(ctx);
await analyzeStage(ctx);
const a = ctx.analysis!;
console.log(JSON.stringify({ overview: a.overview, model: a.model, technologies: a.technologies.map((t) => `${t.name} (${t.kind} ${t.score}): ${t.signals.join(", ")}`), findings: a.findings.map((f) => `[${f.severity}/${f.category}/${f.confidence.kind} ${f.confidence.score}] ${f.id}: ${f.title} | ev ${f.evidence.map((e) => e.id).join(",")} | actions ${f.actions.length}`) }, null, 1));
