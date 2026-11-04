/**
 * Server-side SSRF guard. Node only (uses DNS). Import from "@red/shared/server".
 *
 * validatePublicUrl() is the syntactic gate (https, hostname shape, no IP
 * literals, no internal TLDs). assertPublicUrl() adds the part a browser can't
 * do: resolve every A and AAAA record and refuse if ANY points into a private,
 * loopback, link-local, CGNAT, multicast, or cloud-metadata range.
 *
 * DNS rebinding: a name can resolve publicly now and privately a second later.
 * The scanner must connect to one of the returned `addresses` (pin it) rather
 * than resolving again, or re-run this check in its own fetch hook.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  isPrivateIPv4,
  isPrivateIPv6,
  parseIPv4,
  validatePublicUrl,
  type UrlRejection,
} from "../url";

export type SsrfRejection = UrlRejection | "dns-failed" | "resolves-private";

export class UnsafeUrlError extends Error {
  readonly code: SsrfRejection;
  constructor(code: SsrfRejection, message: string) {
    super(message);
    this.name = "UnsafeUrlError";
    this.code = code;
  }
}

export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;

const defaultResolver: Resolver = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/** True for any address a public-web fetch must never reach. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const parts = parseIPv4(address);
    return parts ? isPrivateIPv4(parts) : true;
  }
  if (family === 6) {
    const a = address.toLowerCase();
    if (isPrivateIPv6(a)) return true;
    // NAT64 / 6to4 / Teredo can embed private IPv4; refuse them outright.
    if (
      a.startsWith("64:ff9b:") ||
      a.startsWith("2002:") ||
      a.startsWith("2001:0:") ||
      a.startsWith("2001::")
    )
      return true;
    // IPv4-compatible (deprecated) ::a.b.c.d
    const compat = a.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
    if (compat?.[1]) return isBlockedAddress(compat[1]);
    return false;
  }
  return true; // not an IP at all: refuse
}

export interface PublicUrl {
  url: string;
  hostname: string;
  /** Every address the hostname resolved to, all public. Pin one when fetching. */
  addresses: string[];
}

export async function assertPublicUrl(
  raw: string,
  resolve: Resolver = defaultResolver,
): Promise<PublicUrl> {
  const check = validatePublicUrl(raw);
  if (!check.ok) throw new UnsafeUrlError(check.reason, check.message);

  let records: { address: string; family: number }[];
  try {
    records = await resolve(check.hostname);
  } catch {
    throw new UnsafeUrlError(
      "dns-failed",
      `Couldn't resolve ${check.hostname}. Check the domain and try again.`,
    );
  }
  if (records.length === 0) {
    throw new UnsafeUrlError("dns-failed", `${check.hostname} has no address records.`);
  }
  if (records.some((r) => isBlockedAddress(r.address))) {
    throw new UnsafeUrlError(
      "resolves-private",
      `${check.hostname} points to a private or reserved address, so RED won't fetch it.`,
    );
  }
  return { url: check.url, hostname: check.hostname, addresses: records.map((r) => r.address) };
}
