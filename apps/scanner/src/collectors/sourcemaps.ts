import { EVIDENCE_LIMITS, SourceMapsSchema, type SourceMaps } from "@red/shared";
import { capUrl } from "./util";

export interface InspectedAsset {
  url: string;
  /** Response headers, lower-cased. */
  headers: Record<string, string>;
  /** At most EVIDENCE_LIMITS.resourceInspectBytes from the END of the body. */
  tail: string | null;
}

const COMMENT = /[#@]\s*sourceMappingURL\s*=\s*(\S+?)\s*(?:\*\/)?\s*$/m;

/** Finds source maps the page itself points to. Data: URIs are recorded as inline, not fetched. */
export function findReferences(assets: InspectedAsset[]): SourceMaps["referenced"] {
  const out: SourceMaps["referenced"] = [];
  for (const a of assets) {
    const header = a.headers["sourcemap"] ?? a.headers["x-sourcemap"];
    let ref: string | null = null;
    let via: "header" | "comment" = "header";
    if (header) ref = header.trim();
    else if (a.tail) {
      const lines = a.tail.trimEnd().split("\n").slice(-3).join("\n");
      const m = lines.match(COMMENT);
      if (m?.[1]) {
        ref = m[1];
        via = "comment";
      }
    }
    if (!ref) continue;
    if (ref.startsWith("data:")) {
      out.push({ assetUrl: capUrl(a.url), mapUrl: "data:(inline)", via });
      continue;
    }
    try {
      out.push({ assetUrl: capUrl(a.url), mapUrl: capUrl(new URL(ref, a.url).toString()), via });
    } catch {
      /* malformed reference: ignore */
    }
    if (out.length >= 400) break;
  }
  return out;
}

/** From a fetched map, keep only `file` and `sources` paths. Never sourcesContent. */
export function summarizeMap(mapUrl: string, status: number | null, body: string | null, truncatedBody: boolean, skipped: string | null) {
  if (skipped || body == null) {
    return { mapUrl: capUrl(mapUrl), status, file: null, sources: [], sourcesCount: 0, truncated: false, skipped: skipped ?? "no body" };
  }
  try {
    const j = JSON.parse(body) as { file?: unknown; sources?: unknown };
    const sources = Array.isArray(j.sources) ? j.sources.filter((s): s is string => typeof s === "string") : [];
    return {
      mapUrl: capUrl(mapUrl),
      status,
      file: typeof j.file === "string" ? j.file.slice(0, 500) : null,
      sources: sources.slice(0, EVIDENCE_LIMITS.sourcesPerMap).map((s) => s.slice(0, 500)),
      sourcesCount: sources.length,
      truncated: sources.length > EVIDENCE_LIMITS.sourcesPerMap,
      skipped: null,
    };
  } catch {
    return {
      mapUrl: capUrl(mapUrl),
      status,
      file: null,
      sources: [],
      sourcesCount: 0,
      truncated: false,
      skipped: truncatedBody ? "map larger than inspection cap; sources list not read" : "not valid JSON",
    };
  }
}

export function buildSourceMaps(referenced: SourceMaps["referenced"], fetched: ReturnType<typeof summarizeMap>[]): SourceMaps {
  return SourceMapsSchema.parse({ referenced, fetched: fetched.slice(0, EVIDENCE_LIMITS.sourceMapsFetched) });
}
