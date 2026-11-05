import "server-only";

export interface ScannerHealth {
  online: boolean;
  queued: number | null;
  /** The host idles the scanner when unused (free tiers); a request wakes it in about a minute. */
  wakes: boolean;
}

const wakes = () => process.env.SCANNER_SLEEPS === "1";

/**
 * Nudges a sleeping scanner awake (free hosts stop idle services and start
 * them on the next HTTP request). Fire-and-forget; never throws.
 */
export async function wakeScanner(): Promise<void> {
  const base = process.env.SCANNER_URL;
  if (!base) return;
  try {
    await fetch(new URL("/health", base), { cache: "no-store", signal: AbortSignal.timeout(8000) });
  } catch {
    // Asleep hosts hold the request while they boot; the timeout is expected.
  }
}

/**
 * Asks the scanner's /health whether a worker is running. Never throws:
 * an unreachable scanner is reported as offline. Short timeout so a page
 * render never waits on it.
 */
export async function scannerHealth(): Promise<ScannerHealth> {
  const base = process.env.SCANNER_URL;
  if (!base) return { online: false, queued: null, wakes: wakes() };
  try {
    const res = await fetch(new URL("/health", base), { cache: "no-store", signal: AbortSignal.timeout(1500) });
    const body = (await res.json().catch(() => null)) as {
      status?: string;
      worker?: { running?: boolean; draining?: boolean };
      queue?: { queued?: number };
    } | null;
    const online = res.ok && body?.status === "ok" && body.worker?.running === true && !body.worker?.draining;
    return { online, queued: typeof body?.queue?.queued === "number" ? body.queue.queued : null, wakes: wakes() };
  } catch {
    if (wakes()) void wakeScanner();
    return { online: false, queued: null, wakes: wakes() };
  }
}
