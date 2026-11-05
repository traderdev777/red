/**
 * Minimal robots.txt matcher (RFC 9309 subset): groups by user-agent, longest
 * match wins, Allow beats Disallow on ties, * and $ wildcards. Used to decide
 * whether we may fetch anything beyond the single page view (source maps).
 */
interface Rule {
  allow: boolean;
  pattern: string;
}

export function parseRobots(text: string): Map<string, Rule[]> {
  const groups = new Map<string, Rule[]>();
  let agents: string[] = [];
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!lastWasAgent) agents = [];
      agents.push(value.toLowerCase());
      for (const a of agents) if (!groups.has(a)) groups.set(a, []);
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if ((key === "allow" || key === "disallow") && agents.length) {
      if (key === "disallow" && value === "") continue;
      for (const a of agents) groups.get(a)!.push({ allow: key === "allow", pattern: value });
    }
  }
  return groups;
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** product = "redscanner". Falls back to "*" group. No robots.txt = allowed. */
export function isAllowed(robots: string | null, path: string, product = "redscanner"): boolean {
  if (robots == null) return true;
  const groups = parseRobots(robots);
  const rules = groups.get(product) ?? groups.get("*") ?? [];
  let best: Rule | null = null;
  for (const r of rules) {
    if (!toRegex(r.pattern).test(path)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}
