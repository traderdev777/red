import { describe, expect, it } from "vitest";
import { assertPublicUrl, isBlockedAddress, UnsafeUrlError, type Resolver } from "./ssrf";

/** Fake DNS so tests are deterministic and offline. */
const dns =
  (table: Record<string, string[]>): Resolver =>
  async (host) => {
    const addrs = table[host];
    if (!addrs) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return addrs.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };

const resolver = dns({
  "example.com": ["93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c"],
  "wordpress.com": ["192.0.78.9"],
  "rebind.attacker.test.example.org": ["10.0.0.5"],
  "metadata.example.org": ["169.254.169.254"],
  "loop.example.org": ["127.0.0.1"],
  "v6loop.example.org": ["::1"],
  "ula.example.org": ["fd00::1234"],
  "linklocal.example.org": ["fe80::1"],
  "mixed.example.org": ["93.184.215.14", "192.168.0.10"],
  "cgnat.example.org": ["100.64.1.1"],
  "rfc1918b.example.org": ["172.31.255.255"],
  "mapped.example.org": ["::ffff:127.0.0.1"],
  "nat64.example.org": ["64:ff9b::a00:1"],
  "empty.example.org": [],
});

async function rejection(url: string) {
  try {
    await assertPublicUrl(url, resolver);
  } catch (e) {
    expect(e).toBeInstanceOf(UnsafeUrlError);
    return (e as UnsafeUrlError).code;
  }
  throw new Error(`expected ${url} to be rejected`);
}

describe("assertPublicUrl", () => {
  it("accepts a public https host and returns its addresses for pinning", async () => {
    const r = await assertPublicUrl("example.com/pricing", resolver);
    expect(r).toEqual({
      url: "https://example.com/pricing",
      hostname: "example.com",
      addresses: ["93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c"],
    });
  });

  it("accepts public addresses next to reserved blocks (192.0.78.x is WordPress.com)", async () => {
    await expect(assertPublicUrl("https://wordpress.com", resolver)).resolves.toBeTruthy();
  });

  it.each([
    ["http://example.com", "not-https"],
    ["https://localhost", "localhost"],
    ["https://box.local", "reserved-tld"],
    ["https://db.internal", "reserved-tld"],
    ["https://127.0.0.1", "private-ip"],
    ["https://93.184.215.14", "ip-literal"],
    ["https://[::1]", "private-ip"],
  ])("rejects before DNS: %s", async (url, code) => {
    expect(await rejection(url)).toBe(code);
  });

  it.each([
    ["10/8 via DNS", "https://rebind.attacker.test.example.org"],
    ["169.254 metadata via DNS", "https://metadata.example.org"],
    ["127/8 via DNS", "https://loop.example.org"],
    ["::1 via DNS", "https://v6loop.example.org"],
    ["fc00::/7 via DNS", "https://ula.example.org"],
    ["fe80::/10 via DNS", "https://linklocal.example.org"],
    ["172.16/12 via DNS", "https://rfc1918b.example.org"],
    ["100.64/10 via DNS", "https://cgnat.example.org"],
    ["IPv4-mapped loopback via DNS", "https://mapped.example.org"],
    ["NAT64 via DNS", "https://nat64.example.org"],
    ["any private record among public ones", "https://mixed.example.org"],
  ])("rejects a hostname that resolves privately: %s", async (_label, url) => {
    expect(await rejection(url)).toBe("resolves-private");
  });

  it("rejects names that don't resolve", async () => {
    expect(await rejection("https://nope.example.org")).toBe("dns-failed");
    expect(await rejection("https://empty.example.org")).toBe("dns-failed");
  });
});

describe("isBlockedAddress", () => {
  it.each([
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "127.0.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fd00::1",
    "fe80::1",
    "::",
  ])("blocks %s", (a) => expect(isBlockedAddress(a)).toBe(true));
  it.each(["93.184.215.14", "1.1.1.1", "192.0.78.9", "2606:4700:4700::1111"])("allows %s", (a) =>
    expect(isBlockedAddress(a)).toBe(false),
  );
});
