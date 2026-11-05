// Runs one Lighthouse audit in its own process. Lighthouse keeps global state
// (performance marks, log), so two audits in one process corrupt each other.
// Input: argv JSON { url, port, userAgent, maxWaitForLoad }. Output: one JSON line on stdout.
import lighthouse from "lighthouse";

const { url, port, userAgent, maxWaitForLoad } = JSON.parse(process.argv[2]);
try {
  const result = await lighthouse(url, {
    port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    maxWaitForLoad,
    emulatedUserAgent: `${userAgent} Chrome-Lighthouse`,
  });
  const lhr = result?.lhr;
  if (!lhr) throw new Error("Lighthouse returned no report");
  // Only what buildLighthouse reads; the full LHR can be several MB.
  const audits = {};
  for (const [id, a] of Object.entries(lhr.audits)) {
    audits[id] = { title: a.title, score: a.score, displayValue: a.displayValue, numericValue: a.numericValue };
  }
  const categories = {};
  for (const [id, c] of Object.entries(lhr.categories)) categories[id] = { score: c.score };
  process.stdout.write(JSON.stringify({ ok: true, lhr: { lighthouseVersion: lhr.lighthouseVersion, runtimeError: lhr.runtimeError, categories, audits } }) + "\n");
  process.exit(0);
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, error: String(e?.message ?? e) }) + "\n");
  process.exit(0);
}
