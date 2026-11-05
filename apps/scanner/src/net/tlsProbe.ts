/**
 * Reads the site's TLS certificate through the GuardProxy (CONNECT tunnel),
 * so the same address pinning and private-range rules apply as for every
 * other request. Only certificate metadata is kept.
 */
import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import type { RawSecurityDetails } from "../collectors/tlsDns";

export function probeTls(proxyUrl: string, host: string, port = 443, timeoutMs = 6_000): Promise<RawSecurityDetails | null> {
  const proxy = new URL(proxyUrl);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: RawSecurityDetails | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const sock = netConnect(Number(proxy.port), proxy.hostname);
    sock.once("error", () => finish(null));
    sock.once("connect", () => sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`));
    let head = "";
    const onData = (b: Buffer) => {
      head += b.toString("latin1");
      const end = head.indexOf("\r\n\r\n");
      if (end === -1) {
        if (head.length > 8192) finish(null);
        return;
      }
      sock.off("data", onData);
      if (!/^HTTP\/1\.[01] 200/.test(head)) return finish(null);
      const t = tlsConnect({ socket: sock, servername: host, rejectUnauthorized: false, ALPNProtocols: ["http/1.1"] });
      t.once("error", () => finish(null));
      t.once("secureConnect", () => {
        const c = t.getPeerCertificate();
        const issuer = c?.issuer ? (c.issuer.O ?? c.issuer.CN) : undefined;
        const toS = (d?: string) => (d ? Math.floor(Date.parse(d) / 1000) : undefined);
        const v: RawSecurityDetails = {
          protocol: t.getProtocol()?.replace(/^TLSv/, "TLS ") ?? undefined,
          issuer: Array.isArray(issuer) ? issuer[0] : issuer,
          subjectName: (Array.isArray(c?.subject?.CN) ? c.subject.CN[0] : c?.subject?.CN) ?? undefined,
          validFrom: toS(c?.valid_from),
          validTo: toS(c?.valid_to),
        };
        t.destroy();
        finish(v);
      });
    };
    sock.on("data", onData);
  });
}
