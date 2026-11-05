/**
 * The analysis view of the evidence. When a desktop probe timed out (busy
 * page) but the mobile pass read the same thing, analysis uses the mobile
 * reading and says so. When neither pass has it, that part is "unavailable":
 * no absence finding may be drawn from it ("no <title>" from an empty probe
 * would be invented).
 */
import type { EvidenceDoc } from "@red/shared";

export type Part = "head" | "assets" | "runtime" | "vitals" | "timing" | "cookies";

export interface AnalysisView {
  doc: EvidenceDoc;
  unavailable: Set<Part>;
  /** Parts read from the mobile pass instead of desktop. */
  fromMobile: Set<Part>;
}

export function analysisView(doc: EvidenceDoc): AnalysisView {
  const d = doc.passes.desktop;
  const m = doc.passes.mobile;
  const unavailable = new Set<Part>();
  const fromMobile = new Set<Part>();
  const desktop = { ...d };
  for (const part of (d.incomplete ?? []) as Part[]) {
    const mobileHas = m && !(m.incomplete ?? []).includes(part);
    if (mobileHas && m) {
      fromMobile.add(part);
      if (part === "head") desktop.head = m.head;
      if (part === "assets") desktop.assets = m.assets;
      if (part === "runtime") desktop.runtime = m.runtime;
      if (part === "cookies") desktop.cookies = m.cookies;
      if (part === "vitals") unavailable.add("vitals"); // mobile vitals are reported separately; desktop stays unknown
      if (part === "timing") unavailable.add("timing");
    } else {
      unavailable.add(part);
    }
  }
  return { doc: { ...doc, passes: { ...doc.passes, desktop } }, unavailable, fromMobile };
}
