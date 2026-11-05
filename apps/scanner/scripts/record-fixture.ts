/**
 * Records one real desktop pass as a unit-test fixture.
 *   pnpm --filter @red/scanner exec tsx scripts/record-fixture.ts https://example.com name
 * Cookie values are dropped and the screenshot is not kept, so fixtures never hold secrets.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { assertPublicUrl } from "@red/shared/server";
import { GuardProxy } from "../src/net/guardProxy";
import { runPass } from "../src/collectors/pass";
import { redactSetCookie } from "../src/collectors/headers";

const [url, name] = process.argv.slice(2);
if (!url || !name) throw new Error("usage: record-fixture <url> <name>");
const ua = "REDScanner/1.0.0 (+https://red.example/bot)";
const guard = new GuardProxy({ upstream: process.env.SCANNER_UPSTREAM_PROXY ?? null });
await guard.start();
const browser = await chromium.launch({ args: [`--proxy-server=${guard.url}`, "--proxy-bypass-list=<-loopback>", "--disable-quic"] });
try {
  const raw = await runPass({
    browser,
    url,
    kind: "desktop",
    userAgent: ua,
    deadline: Date.now() + 45_000,
    checkNavigation: async (u) => void (await assertPublicUrl(u)),
    guardBlocks: () => [],
  });
  const fixture = {
    ...raw,
    screenshot: null,
    headers: raw.headers.map((h) => (h.name.toLowerCase() === "set-cookie" ? { ...h, value: redactSetCookie(h.value) } : h)),
    network: raw.network.map((r) => ({
      ...r,
      responseHeaders: Object.fromEntries(
        Object.entries(r.responseHeaders ?? {}).map(([k, v]) => [k, k.toLowerCase() === "set-cookie" ? "[redacted]" : v]),
      ),
    })),
    cookies: raw.cookies.map(({ value: _drop, ...c }) => c),
    html: raw.html ? raw.html.slice(0, 20_000) : null,
    inspected: raw.inspected.map((a) => ({ ...a, tail: a.tail ? a.tail.slice(-2_000) : null })),
  };
  writeFileSync(new URL(`../test/fixtures/${name}.raw.json`, import.meta.url), JSON.stringify(fixture, null, 1));
  console.log(`recorded ${name}: ${raw.network.length} network records, ${raw.cookies.length} cookies`);
} finally {
  await browser.close();
  await guard.stop();
}
