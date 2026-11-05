/**
 * Dev tool: writes a full Lighthouse result (same shape as PageSpeed
 * Insights' lighthouseResult) for a URL, using local Chrome through the
 * GuardProxy. Used to exercise lite collection where PSI can't be reached.
 *   tsx scripts/lhr-fixture.ts <url> <mobile|desktop> <out.json>
 */
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { chromium } from "playwright";
import lighthouse from "lighthouse";
import { GuardProxy } from "../src/net/guardProxy";

const [url, strategy, out] = process.argv.slice(2);
const port = await new Promise<number>((r) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = (s.address() as { port: number }).port;
    s.close(() => r(p));
  });
});
const guard = new GuardProxy({ upstream: process.env.SCANNER_UPSTREAM_PROXY ?? null });
await guard.start();
const browser = await chromium.launch({ headless: true, args: [`--proxy-server=${guard.url}`, `--remote-debugging-port=${port}`, "--ignore-certificate-errors"] });
try {
  const res = await lighthouse(url!, {
    port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    maxWaitForLoad: 35_000,
    ...(strategy === "desktop" ? { formFactor: "desktop" as const, screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttlingMethod: "simulate" as const } : {}),
  });
  writeFileSync(out!, JSON.stringify(res!.lhr));
  console.log("ok", Object.fromEntries(Object.entries(res!.lhr.categories).map(([k, v]) => [k, v.score])));
} finally {
  await browser.close();
  await guard.stop();
}
