"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import type { ScanStatus } from "@red/shared";
import { retryScan, type StartScanState } from "@/app/app/actions";
import { realtimeClient } from "@/lib/supabase/browser";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { PixelDissolve } from "@/motion/PixelDissolve";
import { ScanLine } from "@/motion/ScanLine";
import { StatusBadge, statusLabel } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { LocalTime, duration } from "./LocalTime";

export interface ScanViewData {
  id: string;
  url: string;
  normalized_url: string;
  status: ScanStatus;
  progress: number;
  error: string | null;
  cached_from: string | null;
  retry_of: string | null;
  failed_stage: string | null;
  attempt: number;
  created_at: string;
  finished_at: string | null;
}

const STEPS = ["Collect", "Fingerprint", "Compress", "Analyze"] as const;

/**
 * Which step is active, from what the scanner reports, never invented:
 *   collecting → Collect, Fingerprint, Compress (split by the scanner's own progress)
 *   analyzing  → Analyze
 * queued and done have no active step.
 */
function activeStep(s: Pick<ScanViewData, "status" | "progress">): number {
  if (s.status === "collecting") return s.progress < 34 ? 0 : s.progress < 67 ? 1 : 2;
  if (s.status === "analyzing") return 3;
  return -1;
}
function stepState(i: number, s: ScanViewData): "done" | "active" | "pending" | "failed" {
  if (s.status === "done") return "done";
  if (s.status === "failed") {
    const at = s.failed_stage === "analyzing" ? 3 : s.failed_stage === "collecting" ? 0 : -1;
    return i < at ? "done" : i === at ? "failed" : "pending";
  }
  const a = activeStep(s);
  return i < a ? "done" : i === a ? "active" : "pending";
}

/** The four coarse phases a dissolve may run between. Progress ticks inside a phase never trigger it. */
const phase = (s: ScanStatus) => (s === "collecting" || s === "analyzing" ? "running" : s);

export function ScanView({ initial }: { initial: ScanViewData }) {
  const router = useRouter();
  const [scan, setScan] = useState(initial);
  const [resolved, setResolved] = useState(true);
  const [shown, setShown] = useState(initial);
  const [announce, setAnnounce] = useState("");
  const [retry, retryAction, retrying] = useActionState<StartScanState, FormData>(retryScan, {
    status: "idle",
  });
  const handled = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let ch: RealtimeChannel | null = null;
    realtimeClient().then((client) => {
      if (cancelled) return;
      supabase = client;
      ch = client
        .channel(`scan:${initial.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "scans", filter: `id=eq.${initial.id}` },
          (p) => setScan((prev) => ({ ...prev, ...(p.new as Partial<ScanViewData>) })),
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (supabase && ch) supabase.removeChannel(ch);
    };
  }, [initial.id]);

  // PixelDissolve only when the scan changes phase (queued → running → done/failed).
  useEffect(() => {
    if (phase(scan.status) === phase(shown.status)) {
      setShown(scan);
      return;
    }
    setAnnounce(`Scan ${statusLabel(scan.status).toLowerCase()}`);
    setResolved(false);
    const t = setTimeout(() => {
      setShown(scan);
      setResolved(true);
    }, 450);
    return () => clearTimeout(t);
  }, [scan, shown.status]);

  useEffect(() => {
    if (!("at" in retry) || retry.at === handled.current) return;
    handled.current = retry.at;
    if (retry.ok) router.push(`/app/scans/${retry.scanId}`);
  }, [retry, router]);

  const s = shown;
  const running = s.status === "collecting" || s.status === "analyzing";
  const freeRetry =
    (s.failed_stage === "queued" || s.failed_stage === "collecting") && s.attempt < 3;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={scan.status} cached={Boolean(scan.cached_from)} />
          <span className="text-step-n2 text-chrome-500 font-mono">
            started <LocalTime iso={scan.created_at} />
            {scan.finished_at ? ` · took ${duration(scan.created_at, scan.finished_at)}` : ""}
            {scan.attempt > 1 ? ` · attempt ${scan.attempt}` : ""}
          </span>
        </div>
        <h1 className="text-step-3 text-chrome-100 break-all font-mono">{scan.normalized_url}</h1>
        {scan.cached_from && (
          <p className="text-step-n1 text-chrome-300">
            Reused a scan of this URL from the last 7 days. No quota was used.{" "}
            <Link
              href={`/app/scans/${scan.cached_from}`}
              className="text-chrome-100 decoration-line font-mono underline underline-offset-4"
            >
              Original
            </Link>
          </p>
        )}
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <ol
        aria-label="Scan stages"
        className="border-line bg-line grid grid-cols-2 gap-px overflow-hidden rounded-lg border md:grid-cols-4"
      >
        {STEPS.map((name, i) => {
          const st = stepState(i, scan);
          return (
            <li
              key={name}
              aria-current={st === "active" ? "step" : undefined}
              className="bg-ink-950 relative p-4"
            >
              {st === "active" && <ScanLine active />}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 top-0 h-0.5",
                  st === "active"
                    ? "bg-red-500"
                    : st === "done"
                      ? "bg-chrome-500"
                      : st === "failed"
                        ? "bg-risk"
                        : "bg-transparent",
                )}
              />
              <span className="text-step-n2 text-chrome-500 font-mono">0{i + 1}</span>
              <p
                className={cn(
                  "text-step-0 mt-1",
                  st === "pending" ? "text-chrome-500" : "text-chrome-100",
                )}
              >
                {name}
              </p>
              <p className="text-step-n2 text-chrome-500 font-mono">
                {st === "active"
                  ? "running"
                  : st === "done"
                    ? "done"
                    : st === "failed"
                      ? "failed here"
                      : "waiting"}
              </p>
            </li>
          );
        })}
      </ol>

      <PixelDissolve resolved={resolved} className="rounded-lg">
        <section
          aria-label="Scan state"
          className="border-line bg-ink-900 rounded-lg border p-6 md:p-8"
        >
          {s.status === "queued" && (
            <div className="flex flex-col gap-3">
              <h2 className="text-step-2 text-chrome-100">
                Queued. The scanner connects in the next build step.
              </h2>
              <p className="text-step-0 text-chrome-300 max-w-[60ch]">
                This scan is saved and waiting. Nothing has been fetched yet, and no progress is
                shown until the scanner reports it.
              </p>
            </div>
          )}
          {running && (
            <div className="flex flex-col gap-3">
              <h2 className="text-step-2 text-chrome-100">{statusLabel(s.status)}</h2>
              <p className="text-step-n1 text-chrome-300 font-mono">
                progress {s.progress}% (reported by the scanner)
              </p>
            </div>
          )}
          {s.status === "failed" && (
            <div className="flex flex-col gap-4">
              <h2 className="text-step-2 text-chrome-100">This scan failed.</h2>
              <pre className="bg-ink-950 text-step-n1 text-chrome-300 whitespace-pre-wrap break-words rounded-md border border-red-900 p-4 font-mono">
                {s.error ?? "The scanner reported a failure without a message."}
              </pre>
              <form action={retryAction} className="flex flex-wrap items-center gap-4">
                <input type="hidden" name="scanId" value={s.id} />
                <Button
                  type="submit"
                  loading={retrying}
                  loadingLabel="Retrying"
                  leading={<Icon as={RotateCcw} />}
                >
                  Retry
                </Button>
                <span className="text-step-n2 text-chrome-500 font-mono">
                  {freeRetry
                    ? "Failed before analysis: retry is free."
                    : "Uses one scan from today's quota."}
                </span>
              </form>
              {"ok" in retry && !retry.ok && (
                <p role="alert" className="text-step-n1 text-red-500">
                  {retry.message}
                </p>
              )}
            </div>
          )}
          {s.status === "done" && (
            <div className="flex flex-col gap-3">
              <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
                Placeholder
              </span>
              <h2 className="text-step-2 text-chrome-100">
                Results render here in the next build step.
              </h2>
              <p className="text-step-0 text-chrome-300 max-w-[60ch]">
                The scan is marked done. Findings, evidence, and actions aren&rsquo;t rendered yet,
                and none are shown here until they come from the scanner.
              </p>
            </div>
          )}
        </section>
      </PixelDissolve>
    </div>
  );
}
