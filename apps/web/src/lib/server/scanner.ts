import "server-only";

export interface ScannerHealth {
  online: boolean;
  queued: number | null;
}

/**
 * Asks the scanner's /health whether a worker is running. Never throws:
 * an unreachable scanner is reported as offline. Short timeout so a page
 * render never waits on it.
 */
export async function scannerHealth(): Promise<ScannerHealth> {
  const base = process.env.SCANNER_URL;
  if (!base) return { online: false, queued: null };
  try {
    const res = await fetch(new URL("/health", base), { cache: "no-store", signal: AbortSignal.timeout(1500) });
    const body = (await res.json().catch(() => null)) as {
      status?: string;
      worker?: { running?: boolean; draining?: boolean };
      queue?: { queued?: number };
    } | null;
    const online = res.ok && body?.status === "ok" && body.worker?.running === true && !body.worker?.draining;
    return { online, queued: typeof body?.queue?.queued === "number" ? body.queue.queued : null };
  } catch {
    return { online: false, queued: null };
  }
}
