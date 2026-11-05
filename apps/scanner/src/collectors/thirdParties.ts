import { ThirdPartySchema, type NetworkEntry, type ThirdParty } from "@red/shared";
import { classifyHost } from "@red/shared/third-parties";
import { hostOf } from "./util";

/** Groups third-party requests by registrable domain, labelled from the shared list. */
export function groupThirdParties(entries: NetworkEntry[]): ThirdParty[] {
  const groups = new Map<string, ThirdParty>();
  for (const e of entries) {
    if (e.party !== "third") continue;
    const host = hostOf(e.url);
    const known = classifyHost(host);
    const key = e.domain;
    const g = groups.get(key) ?? {
      domain: key,
      vendor: known?.vendor ?? null,
      category: known?.category ?? "other",
      requests: 0,
      transferBytes: 0,
    };
    // A more specific match on a later host of the same domain wins over "other".
    if (!g.vendor && known) {
      g.vendor = known.vendor;
      g.category = known.category;
    }
    g.requests += 1;
    g.transferBytes += e.transferBytes ?? 0;
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => b.requests - a.requests || a.domain.localeCompare(b.domain))
    .slice(0, 300)
    .map((g) => ThirdPartySchema.parse(g));
}
