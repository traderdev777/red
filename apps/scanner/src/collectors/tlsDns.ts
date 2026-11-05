import { resolveCname, lookup, resolveTxt } from "node:dns/promises";
import { DnsSchema, TlsSchema } from "@red/shared";
import type { z } from "zod";
import { isoUtc } from "./util";

export interface RawSecurityDetails {
  protocol?: string;
  issuer?: string;
  subjectName?: string;
  validFrom?: number; // seconds
  validTo?: number;
}

export function buildTls(d: RawSecurityDetails | null): z.infer<typeof TlsSchema> | null {
  if (!d) return null;
  const iso = (s?: number) => (s ? isoUtc(s * 1000) : null);
  return TlsSchema.parse({
    protocol: d.protocol?.slice(0, 50) ?? null,
    issuer: d.issuer?.slice(0, 500) ?? null,
    subject: d.subjectName?.slice(0, 500) ?? null,
    validFrom: iso(d.validFrom),
    validTo: iso(d.validTo),
  });
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/** "13335 | 104.20.16.0/20 | US | arin | 2014-03-28" (Team Cymru IP-to-ASN over DNS). */
export function parseCymruOrigin(txt: string) {
  const [asn, prefix, country] = txt.split("|").map((s) => s.trim());
  return { asn: asn || null, prefix: prefix || null, country: country || null };
}
/** "13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US" */
export function parseCymruAsName(txt: string) {
  return txt.split("|").map((s) => s.trim())[4] ?? null;
}

export async function collectDns(hostname: string): Promise<z.infer<typeof DnsSchema>> {
  const cnameChain: string[] = [];
  let cur = hostname;
  for (let i = 0; i < 6; i++) {
    try {
      const [next] = await withTimeout(resolveCname(cur), 2500);
      if (!next || cnameChain.includes(next)) break;
      cnameChain.push(next);
      cur = next;
    } catch {
      break;
    }
  }
  let addresses: { address: string; family: number }[] = [];
  try {
    addresses = (await withTimeout(lookup(hostname, { all: true, verbatim: true }), 3000)).slice(0, 32);
  } catch {
    addresses = [];
  }
  const asn = await Promise.all(
    addresses
      .filter((a) => a.family === 4)
      .slice(0, 2)
      .map(async ({ address }) => {
        try {
          const rev = address.split(".").reverse().join(".");
          const [rec] = await withTimeout(resolveTxt(`${rev}.origin.asn.cymru.com`), 2500);
          const o = parseCymruOrigin((rec ?? []).join(""));
          let org: string | null = null;
          if (o.asn) {
            const [n] = await withTimeout(resolveTxt(`AS${o.asn.split(" ")[0]}.asn.cymru.com`), 2500);
            org = parseCymruAsName((n ?? []).join(""));
          }
          return { address, ...o, org };
        } catch {
          return { address, asn: null, prefix: null, country: null, org: null };
        }
      }),
  );
  return DnsSchema.parse({ hostname, cnameChain, addresses, asn });
}
