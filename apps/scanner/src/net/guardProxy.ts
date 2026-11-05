/**
 * Egress guard. Every byte the scan's Chrome (pages, workers, Lighthouse) and
 * our own Node fetches send to the internet goes through this local proxy.
 *
 * For each CONNECT (https) or absolute-URI request (http) it:
 *   1. allows only ports 80 and 443,
 *   2. rejects hostnames that are not public (localhost, *.local, *.internal, ...),
 *   3. resolves the name ITSELF and rejects if ANY address is private, loopback,
 *      link-local, CGNAT, multicast, or cloud metadata (isBlockedAddress),
 *   4. connects to the address it checked (DNS pinning, no second lookup).
 *
 * Chrome is launched with --proxy-bypass-list=<-loopback> so even loopback
 * goes through here. QUIC and non-proxied WebRTC UDP are disabled at launch.
 *
 * SCANNER_UPSTREAM_PROXY (development sandboxes only) chains to another proxy.
 * The upstream then resolves the name again, so pinning is weaker; the
 * private-address check still runs first. Never set it in production.
 */
import http, { type IncomingMessage } from "node:http";
import net, { type Socket } from "node:net";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isBlockedAddress } from "@red/shared/server";
import { validatePublicUrl } from "@red/shared";

export type Resolve = (host: string) => Promise<{ address: string; family: number }[]>;

export interface BlockEvent {
  host: string;
  port: number;
  reason: string;
  phase: "connect" | "fetch";
}

export interface GuardOptions {
  upstream?: string | null;
  resolve?: Resolve;
  /** host:port pairs allowed despite being private. Honoured only when NODE_ENV === "test". */
  testAllow?: string[];
  onBlock?: (e: BlockEvent) => void;
  connectTimeoutMs?: number;
}

const ALLOWED_PORTS = new Set([80, 443]);
const defaultResolve: Resolve = (h) => lookup(h, { all: true, verbatim: true });

export class GuardProxy {
  private server: http.Server;
  private sockets = new Set<Socket>();
  private readonly resolve: Resolve;
  private readonly upstream: URL | null;
  private readonly testAllow: Set<string>;
  private listeners = new Set<(e: BlockEvent) => void>();
  port = 0;

  constructor(private readonly opts: GuardOptions = {}) {
    this.resolve = opts.resolve ?? defaultResolve;
    this.upstream = opts.upstream ? new URL(opts.upstream) : null;
    this.testAllow = new Set(process.env.NODE_ENV === "test" ? (opts.testAllow ?? []) : []);
    if (opts.onBlock) this.listeners.add(opts.onBlock);
    this.server = http.createServer((req, res) => void this.onHttp(req, res));
    this.server.on("connect", (req, sock, head) => void this.onConnect(req, sock as Socket, head));
    this.server.on("connection", (s) => {
      this.sockets.add(s);
      s.on("close", () => this.sockets.delete(s));
    });
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Subscribe to block events; returns an unsubscribe function. */
  onBlock(fn: (e: BlockEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async start(): Promise<void> {
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.port = (this.server.address() as net.AddressInfo).port;
  }

  async stop(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  /** Returns the address to connect to, or throws with a reason. */
  async check(host: string, port: number): Promise<string> {
    const h = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (this.testAllow.has(`${h}:${port}`)) return h;
    if (!ALLOWED_PORTS.has(port)) throw new Error(`port ${port} not allowed`);
    if (isIP(h)) {
      if (isBlockedAddress(h)) throw new Error("private or reserved address");
      return h;
    }
    const shape = validatePublicUrl(`https://${h}/`);
    if (!shape.ok) throw new Error(shape.reason);
    let records: { address: string }[];
    try {
      records = await this.resolve(h);
    } catch {
      throw new Error("dns-failed");
    }
    if (!records.length) throw new Error("dns-failed");
    if (records.some((r) => isBlockedAddress(r.address))) {
      throw new Error("resolves to a private or reserved address");
    }
    return records[0]!.address;
  }

  private emit(e: BlockEvent) {
    for (const fn of this.listeners) fn(e);
  }

  private async onConnect(req: IncomingMessage, client: Socket, head: Buffer) {
    const [host = "", portStr = "443"] = splitHostPort(req.url ?? "");
    const port = Number(portStr);
    let address: string;
    try {
      address = await this.check(host, port);
    } catch (e) {
      this.emit({ host, port, reason: (e as Error).message, phase: "connect" });
      client.end("HTTP/1.1 403 Forbidden\r\nX-RED-Blocked: 1\r\n\r\n");
      return;
    }
    const upstream = this.upstream && !this.testAllow.has(`${host}:${port}`) ? this.upstream : null;
    const target = upstream
      ? net.connect(Number(upstream.port || 80), upstream.hostname)
      : net.connect(port, address);
    target.setTimeout(this.opts.connectTimeoutMs ?? 15_000, () => target.destroy());
    target.on("error", () => client.destroy());
    client.on("error", () => target.destroy());
    target.once("connect", () => {
      if (upstream) {
        const auth = upstream.username
          ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(upstream.username)}:${decodeURIComponent(upstream.password)}`).toString("base64")}\r\n`
          : "";
        target.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
        let buf = Buffer.alloc(0);
        const onData = (d: Buffer) => {
          buf = Buffer.concat([buf, d]);
          const end = buf.indexOf("\r\n\r\n");
          if (end === -1) return;
          target.off("data", onData);
          const ok = /^HTTP\/1\.[01] 200/.test(buf.subarray(0, end).toString());
          if (!ok) {
            client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
            target.destroy();
            return;
          }
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          const rest = buf.subarray(end + 4);
          if (rest.length) client.write(rest);
          if (head.length) target.write(head);
          target.pipe(client);
          client.pipe(target);
        };
        target.on("data", onData);
      } else {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) target.write(head);
        target.pipe(client);
        client.pipe(target);
      }
    });
  }

  private async onHttp(req: IncomingMessage, res: http.ServerResponse) {
    let u: URL;
    try {
      u = new URL(req.url ?? "");
      if (u.protocol !== "http:") throw new Error("bad scheme");
    } catch {
      res.writeHead(400).end();
      return;
    }
    const port = Number(u.port || 80);
    let address: string;
    try {
      address = await this.check(u.hostname, port);
    } catch (e) {
      this.emit({ host: u.hostname, port, reason: (e as Error).message, phase: "connect" });
      res.writeHead(403, { "x-red-blocked": "1" }).end();
      return;
    }
    const headers = { ...req.headers };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const viaUpstream = this.upstream && !this.testAllow.has(`${u.hostname}:${port}`);
    const up = viaUpstream
      ? http.request({
          host: this.upstream!.hostname,
          port: Number(this.upstream!.port || 80),
          method: req.method,
          path: u.toString(),
          headers: {
            ...headers,
            ...(this.upstream!.username
              ? {
                  "proxy-authorization": `Basic ${Buffer.from(`${decodeURIComponent(this.upstream!.username)}:${decodeURIComponent(this.upstream!.password)}`).toString("base64")}`,
                }
              : {}),
          },
        })
      : http.request({
          host: address,
          port,
          method: req.method,
          path: `${u.pathname}${u.search}`,
          headers: { ...headers, host: u.host },
        });
    up.setTimeout(this.opts.connectTimeoutMs ?? 15_000, () => up.destroy(new Error("timeout")));
    up.on("response", (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  }
}

function splitHostPort(s: string): [string, string] {
  const m = s.match(/^\[([^\]]+)\]:(\d+)$/) ?? s.match(/^([^:]+):(\d+)$/);
  return m ? [m[1]!, m[2]!] : [s, "443"];
}
