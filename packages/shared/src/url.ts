/**
 * Public-URL validation, shared by apps/web (client + server) and apps/scanner.
 *
 * RED only reads what any visitor's browser receives, so a target must be an
 * https URL on a public hostname. This is a first gate, not the last: the
 * scanner must re-check after DNS resolution (a public name can resolve to a
 * private address).
 */

export type UrlCheck =
  | { ok: true; url: string; hostname: string }
  | { ok: false; reason: UrlRejection; message: string };

export type UrlRejection =
  | "empty"
  | "malformed"
  | "not-https"
  | "credentials"
  | "port"
  | "localhost"
  | "private-ip"
  | "ip-literal"
  | "reserved-tld"
  | "no-tld";

const MESSAGES: Record<UrlRejection, string> = {
  empty: "Paste a URL to scan.",
  malformed: "That isn't a valid URL.",
  "not-https": "RED scans over HTTPS only. Use the https:// address.",
  credentials: "Remove the username and password from the URL.",
  port: "Custom ports aren't scanned. Use the site's public https address.",
  localhost: "Localhost isn't reachable from RED. Use a public URL.",
  "private-ip": "Private and reserved IP addresses aren't scanned.",
  "ip-literal": "Use the site's domain name, not an IP address.",
  "reserved-tld": "That hostname is internal-only. Use a public domain.",
  "no-tld": "Include the full domain, like example.com.",
};

const RESERVED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".home.arpa",
  ".corp",
  ".private",
  ".test",
  ".invalid",
  ".example",
  ".onion",
];

function fail(reason: UrlRejection): UrlCheck {
  return { ok: false, reason, message: MESSAGES[reason] };
}

/** Parses dotted-quad IPv4 only (the WHATWG URL parser already normalizes hex/octal forms). */
export function parseIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

export function isPrivateIPv4([a, b, c]: number[]): boolean {
  if (a === undefined || b === undefined || c === undefined) return true;
  return (
    a === 0 || // "this" network
    a === 10 || // RFC 1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local, incl. 169.254.169.254 cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // RFC 1918
    (a === 192 && b === 168) || // RFC 1918
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 198 && (b === 18 || b === 19)) || // benchmarking 198.18/15
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast 224/4, reserved 240/4, broadcast
  );
}

export function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  if (/^fe[89ab]/.test(h)) return true; // link-local
  if (h.startsWith("ff")) return true; // multicast
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) {
    const v4 = parseIPv4(mapped[1]);
    return v4 ? isPrivateIPv4(v4) : true;
  }
  if (h.startsWith("::ffff:")) return true; // hex-form mapped: refuse
  return h.startsWith("2001:db8"); // documentation
}

/** Adds https:// when no scheme is present. Anything else is left for validation to judge. */
export function withScheme(raw: string): string {
  const v = raw.trim();
  if (!v) return v;
  return /^[a-z][a-z\d+\-.]*:/i.test(v) && !/^[^:/]+:\d+/.test(v) ? v : `https://${v}`;
}

export function validatePublicUrl(raw: string): UrlCheck {
  const input = raw.trim();
  if (!input) return fail("empty");
  if (input.length > 2048) return fail("malformed");

  let u: URL;
  try {
    u = new URL(withScheme(input));
  } catch {
    return fail("malformed");
  }

  if (u.protocol !== "https:") return fail(u.protocol === "http:" ? "not-https" : "malformed");
  if (u.username || u.password) return fail("credentials");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return fail("malformed");
  if (host === "localhost" || host.endsWith(".localhost")) return fail("localhost");
  if (u.port && u.port !== "443") return fail("port");

  // IP literals are never scanned. Private ones get the more specific message.
  if (host.startsWith("[")) return fail(isPrivateIPv6(host) ? "private-ip" : "ip-literal");
  const v4 = parseIPv4(host);
  if (v4) return fail(isPrivateIPv4(v4) ? "private-ip" : "ip-literal");
  if (/^[\d.]+$/.test(host)) return fail("private-ip");

  if (!host.includes(".")) return fail("no-tld");
  if (RESERVED_SUFFIXES.some((s) => host.endsWith(s))) return fail("reserved-tld");
  const tld = host.split(".").pop() ?? "";
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)) return fail("no-tld");

  u.hash = "";
  return { ok: true, url: u.toString(), hostname: host };
}
