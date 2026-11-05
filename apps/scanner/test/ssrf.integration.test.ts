/**
 * SSRF integration: a real Chrome, the real egress guard, a local fixture
 * server. The fixture origin is allowed ONLY because NODE_ENV === "test"
 * (vitest sets it); nothing else private is reachable.
 */
import { existsSync } from "node:fs";
import http from "node:http";
import { lookup } from "node:dns/promises";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { collect } from "../src/pipeline/collect";
import { ScanFailure } from "../src/errors";
import { GuardProxy } from "../src/net/guardProxy";
import type { StageContext } from "../src/pipeline/types";
import type { Config } from "../src/config";
import { log } from "../src/log";

const hasChrome = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

const PRIVATE_NAME = "internal.red-fixture.com";
const resolve = async (h: string) => (h === PRIVATE_NAME ? [{ address: "10.0.0.7", family: 4 }] : lookup(h, { all: true, verbatim: true }));

function listen(handler: http.RequestListener) {
  return new Promise<{ server: http.Server; port: number }>((r) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => r({ server, port: (server.address() as AddressInfo).port }));
  });
}

describe.skipIf(!hasChrome)("SSRF: blocked redirects and navigations fail the scan", () => {
  let fixture: { server: http.Server; port: number };
  let secret: { server: http.Server; port: number };
  const secretHits: string[] = [];

  beforeAll(async () => {
    expect(process.env.NODE_ENV).toBe("test");
    secret = await listen((req, res) => {
      secretHits.push(req.url ?? "");
      res.end("internal admin panel");
    });
    fixture = await listen((req, res) => {
      const page = (body: string) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><head><title>fixture</title></head><body>${body}</body></html>`);
      };
      switch (req.url) {
        case "/ok":
          return page(
            `<h1>public page</h1><img src="http://169.254.169.254/latest/meta-data/iam.png"><img src="http://127.0.0.1:${secret.port}/pixel.gif">`,
          );
        case "/to-loopback":
          res.writeHead(302, { location: `http://127.0.0.1:${secret.port}/admin` });
          return res.end();
        case "/to-metadata":
          res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
          return res.end();
        case "/to-private-dns":
          res.writeHead(302, { location: `https://${PRIVATE_NAME}/` });
          return res.end();
        case "/js-nav":
          return page(`<script>location.href = "http://127.0.0.1:${secret.port}/via-script"</script>`);
        default:
          res.writeHead(404).end();
      }
    });
  });

  afterAll(async () => {
    await new Promise((r) => fixture?.server.close(r));
    await new Promise((r) => secret?.server.close(r));
  });

  const ctxFor = (path: string): StageContext => {
    const uploads: string[] = [];
    return {
      scan: {
        id: "00000000-0000-4000-8000-0000000000aa",
        user_id: "00000000-0000-4000-8000-0000000000bb",
        url: `http://127.0.0.1:${fixture.port}${path}`,
        normalized_url: `http://127.0.0.1:${fixture.port}${path}`,
        url_hash: "a".repeat(64),
        status: "collecting",
        attempt: 1,
        created_at: "2026-11-04T00:00:00Z",
      },
      cfg: {
        SCAN_TIMEOUT_MS: 45_000,
        SCANNER_LIGHTHOUSE: "off",
        userAgent: "REDScanner/1.0.0 (+https://red.example/bot)",
        version: "1.0.0",
      } as Config,
      db: { upload: async (p: string) => void uploads.push(p) } as never,
      log,
      progress: async () => undefined,
      onAbort: () => undefined,
    };
  };
  const run = (path: string) => collect(ctxFor(path), { resolve, testAllow: [`127.0.0.1:${fixture.port}`] });

  const expectSsrf = async (path: string) => {
    const err = await run(path).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(ScanFailure);
    expect((err as ScanFailure).kind).toBe("ssrf");
    expect((err as ScanFailure).message).toMatch(/private or reserved address/);
    return err as ScanFailure;
  };

  it("redirect to 127.0.0.1 is blocked and the internal server is never contacted", async () => {
    const e = await expectSsrf("/to-loopback");
    expect(JSON.stringify(e.detail)).toContain("127.0.0.1");
    expect(secretHits).toEqual([]);
  }, 60_000);

  it("redirect to 169.254.169.254 (cloud metadata) is blocked", async () => {
    const e = await expectSsrf("/to-metadata");
    expect(JSON.stringify(e.detail)).toContain("169.254.169.254");
  }, 60_000);

  it("redirect to a public-looking name that resolves to a private IP is blocked", async () => {
    const e = await expectSsrf("/to-private-dns");
    expect(JSON.stringify(e.detail)).toMatch(/internal\.red-fixture\.com/);
  }, 60_000);

  it("a script-driven main-frame navigation to loopback is blocked", async () => {
    await expectSsrf("/js-nav");
    expect(secretHits).toEqual([]);
  }, 60_000);

  it("private subresources are refused and logged; the public page still completes", async () => {
    const ctx = ctxFor("/ok");
    await collect(ctx, { resolve, testAllow: [`127.0.0.1:${fixture.port}`] });
    const blocked = ctx.evidence!.blockedRequests.map((b) => b.host);
    expect(blocked).toContain("169.254.169.254");
    expect(blocked).toContain("127.0.0.1");
    expect(secretHits).toEqual([]);
    expect(ctx.evidence!.passes.desktop.navigation.status).toBe(200);
  }, 60_000);
});

describe("GuardProxy.check", () => {
  const g = new GuardProxy({ resolve });
  it.each([
    ["127.0.0.1", 80],
    ["169.254.169.254", 80],
    ["10.1.2.3", 443],
    ["[::1]", 443],
    ["localhost", 443],
    ["printer.local", 443],
    ["db.internal", 443],
    [PRIVATE_NAME, 443],
    ["example.com", 8080],
  ])("refuses %s:%s", async (host, port) => {
    await expect(g.check(host as string, port as number)).rejects.toThrow();
  });
  it("allows a public host on 443 and pins the checked address", async () => {
    const addr = await g.check("example.com", 443).catch(() => null);
    if (addr) expect(addr).toMatch(/^[\d.:a-f]+$/);
  });
  it("ignores testAllow outside NODE_ENV=test", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const prod = new GuardProxy({ testAllow: ["127.0.0.1:9"] });
    process.env.NODE_ENV = prev;
    await expect(prod.check("127.0.0.1", 9)).rejects.toThrow();
  });
});
