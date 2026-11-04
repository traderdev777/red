import { describe, expect, it } from "vitest";
import { validatePublicUrl } from "./url";
import { canonicalUrl, normalizeUrl } from "./normalize";

describe("validatePublicUrl (client + server syntactic gate)", () => {
  it.each([
    ["example.com", "https://example.com/"],
    ["  Stripe.COM/docs#intro ", "https://stripe.com/docs"],
    ["https://bücher.de", "https://xn--bcher-kva.de/"],
  ])("accepts %s", (input, url) => {
    const r = validatePublicUrl(input);
    expect(r.ok && r.url).toBe(url);
  });

  it.each([
    ["http://example.com", "not-https"],
    ["ftp://example.com", "malformed"],
    ["localhost:3000", "localhost"],
    ["https://localhost", "localhost"],
    ["https://app.localhost", "localhost"],
    ["https://printer.local", "reserved-tld"],
    ["https://db.internal", "reserved-tld"],
    ["https://127.0.0.1", "private-ip"],
    ["https://10.1.2.3", "private-ip"],
    ["https://172.20.0.1", "private-ip"],
    ["https://192.168.1.1", "private-ip"],
    ["https://169.254.169.254/latest/meta-data", "private-ip"],
    ["https://0x7f000001", "private-ip"],
    ["https://2130706433", "private-ip"],
    ["https://[::1]", "private-ip"],
    ["https://[fd12::1]", "private-ip"],
    ["https://[fe80::1]", "private-ip"],
    ["https://8.8.8.8", "ip-literal"],
    ["https://[2606:4700::1111]", "ip-literal"],
    ["https://user:pass@example.com", "credentials"],
    ["https://example.com:8443", "port"],
    ["https://intranet", "no-tld"],
    ["", "empty"],
  ])("rejects %s (%s)", (input, reason) => {
    const r = validatePublicUrl(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
});

describe("normalizeUrl", () => {
  it("lowercases host, strips fragment, tracking params, trailing slash; sorts query", () => {
    expect(canonicalUrl("https://Example.COM/Pricing/?utm_source=x&b=2&gclid=abc&a=1#plans")).toBe(
      "https://example.com/Pricing?a=1&b=2",
    );
    expect(canonicalUrl("https://example.com/")).toBe("https://example.com");
    expect(canonicalUrl("https://example.com:443/docs/")).toBe("https://example.com/docs");
    expect(canonicalUrl("https://example.com./a?fbclid=1")).toBe("https://example.com/a");
  });

  it("equal pages hash equal, different pages differ", async () => {
    const a = await normalizeUrl("https://EXAMPLE.com/?utm_medium=email#top");
    const b = await normalizeUrl("https://example.com");
    const c = await normalizeUrl("https://example.com/about");
    expect(a).toEqual(b);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(c.hash).not.toBe(a.hash);
    // sha256("https://example.com")
    expect(b.hash).toBe("100680ad546ce6a577f42f52df33b4cfdca756859e664b8d7de329b150d09ce9");
  });
});
