/**
 * Gemini client for the analyze stage. One structured-output call; the reply
 * is untrusted input and is validated before anything is kept (see validate.ts).
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

export interface ModelFinding {
  title: string;
  summary: string;
  category: "stack" | "performance" | "accessibility" | "seo" | "security" | "content" | "design" | "conversion";
  severity: "info" | "low" | "medium" | "high" | "critical";
  kind: "detected" | "inferred" | "risk";
  score: number;
  rationale: string;
  evidenceIds: string[];
  actions: { title: string; instruction: string; effort: "minutes" | "hours" | "days"; codeLanguage?: string; code?: string }[];
}

export interface ModelReply {
  overview: string;
  priority: string[];
  ruleActions: { ruleId: string; actions: ModelFinding["actions"] }[];
  findings: ModelFinding[];
}

const ACTION = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    instruction: { type: "STRING" },
    effort: { type: "STRING", enum: ["minutes", "hours", "days"] },
    codeLanguage: { type: "STRING" },
    code: { type: "STRING" },
  },
  required: ["title", "instruction", "effort"],
};

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    overview: { type: "STRING", description: "2-4 plain sentences on what matters most. Only facts from the catalog." },
    priority: { type: "ARRAY", items: { type: "STRING" }, description: "Rule ids and new finding titles, most important first." },
    ruleActions: {
      type: "ARRAY",
      description: "Extra, stack-specific build actions for existing rule findings.",
      items: { type: "OBJECT", properties: { ruleId: { type: "STRING" }, actions: { type: "ARRAY", items: ACTION } }, required: ["ruleId", "actions"] },
    },
    findings: {
      type: "ARRAY",
      description: "New findings the rules did not cover. Each must cite catalog ids.",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          summary: { type: "STRING" },
          category: { type: "STRING", enum: ["stack", "performance", "accessibility", "seo", "security", "content", "design", "conversion"] },
          severity: { type: "STRING", enum: ["info", "low", "medium", "high", "critical"] },
          kind: { type: "STRING", enum: ["detected", "inferred", "risk"] },
          score: { type: "INTEGER" },
          rationale: { type: "STRING" },
          evidenceIds: { type: "ARRAY", items: { type: "STRING" } },
          actions: { type: "ARRAY", items: ACTION },
        },
        required: ["title", "summary", "category", "severity", "kind", "score", "rationale", "evidenceIds", "actions"],
      },
    },
  },
  required: ["overview", "priority", "ruleActions", "findings"],
};

export const SYSTEM_PROMPT = `You are RED's analysis engine. You turn website evidence into findings and build actions for engineers.

Hard rules:
1. You may only use facts that appear in the EVIDENCE CATALOG. Never use outside knowledge about this specific site.
2. Every new finding must cite one or more catalog ids in evidenceIds, copied exactly. A finding without valid ids is discarded.
3. Never state a number, version, vendor, or URL that does not appear in the excerpts you cite.
4. kind "detected": the cited excerpt shows the fact directly. kind "inferred": you are connecting several signals; say which in rationale and score 40-80. kind "risk": a liability (security, legal, measurable loss) shown by the evidence.
5. Do not repeat findings the RULE FINDINGS already cover. Add ruleActions for them only when you can give a more specific, stack-aware step.
6. Build actions are concrete steps for the detected stack. Code must be minimal and correct; omit code when unsure.
7. Prefer fewer, high-value findings (at most 8). If the evidence supports nothing new, return an empty findings array.
8. Plain, direct language. No marketing, no hedging filler.`;

export interface GeminiConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Development sandboxes only: route through an outbound proxy. */
  proxy?: string | null;
}

export async function callGemini(cfg: GeminiConfig, userPrompt: string): Promise<{ reply: unknown; ms: number }> {
  const started = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: "low" },
    },
  };
  const res = await undiciFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.timeoutMs),
    ...(cfg.proxy ? { dispatcher: new ProxyAgent(cfg.proxy) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {
      /* keep raw */
    }
    throw new Error(`Gemini HTTP ${res.status}: ${msg}`);
  }
  const json = JSON.parse(text) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const out = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("");
  if (!out) throw new Error(`Gemini returned no content (finishReason ${json.candidates?.[0]?.finishReason ?? "unknown"})`);
  return { reply: JSON.parse(out), ms: Date.now() - started };
}
