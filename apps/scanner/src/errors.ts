export type FailureKind = "ssrf" | "bot_wall" | "network" | "timeout" | "lost" | "internal";

/** A failure whose message is safe and useful to show the user. */
export class ScanFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ScanFailure";
  }
}

export const MESSAGES = {
  ssrf: "Blocked: the page sent the scanner to a private or reserved address. RED only fetches public sites.",
  botWall: "Blocked by bot protection. RED does not bypass protections.",
  timeout: "Scan exceeded the 60 second limit.",
  internal: "The scanner hit an internal error. No quota was used.",
} as const;

const TRANSIENT = /ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_EMPTY_RESPONSE|ERR_HTTP2_PROTOCOL_ERROR|ERR_CONNECTION_REFUSED|ERR_TUNNEL_CONNECTION_FAILED|ECONNRESET|ETIMEDOUT|socket hang up/;
export const isTransient = (e: unknown) => TRANSIENT.test(String((e as Error)?.message ?? e));

/** "net::ERR_NAME_NOT_RESOLVED at https://..." -> "ERR_NAME_NOT_RESOLVED" */
export function netError(e: unknown): string {
  const m = String((e as Error)?.message ?? e).match(/(?:net::)?(ERR_[A-Z0-9_]+)/);
  return m?.[1] ?? "unknown network error";
}
