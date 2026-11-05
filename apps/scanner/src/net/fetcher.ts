/**
 * Node-side fetches (well-known files, source maps). Always through the
 * GuardProxy, so the same private-address rules and pinning apply as for
 * Chrome. Bodies are read only up to a cap; the rest is never downloaded.
 */
import { ProxyAgent, request } from "undici";
import { validatePublicUrl } from "@red/shared";

export interface CappedResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  /** Up to `cap` bytes. */
  body: Buffer;
  /** Content-Length if sent, else bytes seen (may be the cap). */
  bytes: number | null;
  truncated: boolean;
  /** Redirect hops before the final response. */
  hops: { url: string; status: number; location: string | null }[];
  /** Each Set-Cookie header separately (joining them would break Expires dates). */
  setCookies: string[];
}

export class GuardedFetcher {
  private agent: ProxyAgent;
  constructor(
    proxyUrl: string,
    private readonly userAgent: string,
    private readonly allowHttpForTest: (url: string) => boolean = () => false,
  ) {
    this.agent = new ProxyAgent({ uri: proxyUrl, connectTimeout: 10_000 });
  }

  async close() {
    await this.agent.close();
  }

  /** GET with manual redirects (max 3), each hop re-validated. */
  async get(url: string, cap: number, timeoutMs = 8_000, accept = "*/*"): Promise<CappedResponse> {
    let current = url;
    const hops: CappedResponse["hops"] = [];
    for (let hop = 0; hop <= 3; hop++) {
      if (!this.allowHttpForTest(current)) {
        const v = validatePublicUrl(current);
        if (!v.ok) throw new Error(`blocked: ${v.reason}`);
      }
      const res = await request(current, {
        method: "GET",
        dispatcher: this.agent,
        headers: { "user-agent": this.userAgent, accept },
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
        maxRedirections: 0,
      });
      const headers: Record<string, string> = {};
      const setCookies: string[] = [];
      for (const [k, v] of Object.entries(res.headers)) {
        headers[k] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
        if (k === "set-cookie") setCookies.push(...(Array.isArray(v) ? v : [String(v ?? "")]));
      }
      if (res.statusCode >= 300 && res.statusCode < 400 && headers.location) {
        await res.body.dump();
        hops.push({ url: current, status: res.statusCode, location: headers.location });
        current = new URL(headers.location, current).toString();
        continue;
      }
      const chunks: Buffer[] = [];
      let seen = 0;
      let truncated = false;
      for await (const chunk of res.body) {
        const b = chunk as Buffer;
        if (seen + b.length > cap) {
          chunks.push(b.subarray(0, cap - seen));
          seen = cap;
          truncated = true;
          break;
        }
        chunks.push(b);
        seen += b.length;
      }
      if (truncated) res.body.destroy();
      const len = headers["content-length"] ? Number(headers["content-length"]) : null;
      return {
        url: current,
        status: res.statusCode,
        headers,
        body: Buffer.concat(chunks),
        bytes: len ?? (truncated ? null : seen),
        truncated,
        hops,
        setCookies,
      };
    }
    throw new Error("too many redirects");
  }
}
