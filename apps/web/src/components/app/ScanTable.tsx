"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { ScanStatus } from "@red/shared";
import { listScans, type ScanListItem, type ScanPage } from "@/app/app/actions";
import { realtimeClient } from "@/lib/supabase/browser";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { StatusBadge, statusLabel } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { EmptyScans } from "./EmptyScans";
import { LocalTime, duration } from "./LocalTime";

const FILTERS: (ScanStatus | "all")[] = [
  "all",
  "queued",
  "collecting",
  "analyzing",
  "done",
  "failed",
];

function host(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function ScanTable({
  userId,
  initial,
  pageSize = 20,
}: {
  userId: string;
  initial: ScanPage;
  pageSize?: number;
}) {
  const [rows, setRows] = useState<ScanListItem[]>(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ScanStatus | "all">("all");
  const [announce, setAnnounce] = useState("");
  const [loading, startLoading] = useTransition();
  const [loadingMore, startMore] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const filters = useRef({ q, status });
  filters.current = { q, status };
  const searchId = useId();
  const everHadRows = initial.items.length > 0;

  const load = useCallback(
    (next: { q: string; status: ScanStatus | "all" }) =>
      startLoading(async () => {
        try {
          const page = await listScans({ q: next.q, status: next.status, limit: pageSize });
          setRows(page.items);
          setCursor(page.nextCursor);
          setFailed(null);
        } catch {
          setFailed("Couldn't load scans. Refresh to try again.");
        }
      }),
    [pageSize],
  );

  // Debounced search.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => load({ q, status }), 250);
    return () => clearTimeout(t);
  }, [q, status, load]);

  // Realtime: status and progress changes land in place; new scans appear on top.
  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    realtimeClient().then((client) => {
      if (cancelled) return;
      supabase = client;
      channel = client
        .channel(`scans:${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "scans", filter: `user_id=eq.${userId}` },
          (payload) => {
            const rec = payload.new as ScanListItem | undefined;
            if (!rec?.id) return;
            setRows((prev) => {
              const i = prev.findIndex((r) => r.id === rec.id);
              if (i >= 0) {
                const before = prev[i]!;
                if (before.status !== rec.status)
                  setAnnounce(`${host(rec.url)}: ${statusLabel(rec.status)}`);
                const copy = prev.slice();
                copy[i] = { ...before, ...rec };
                return copy;
              }
              if (payload.eventType !== "INSERT") return prev;
              const f = filters.current;
              if (f.status !== "all" && rec.status !== f.status) return prev;
              if (f.q && !rec.normalized_url.toLowerCase().includes(f.q.toLowerCase())) return prev;
              return [rec, ...prev];
            });
          },
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (supabase && channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  const more = () =>
    startMore(async () => {
      if (!cursor) return;
      try {
        const page = await listScans({ q, status, limit: pageSize, cursor });
        setRows((prev) => [...prev, ...page.items.filter((r) => !prev.some((p) => p.id === r.id))]);
        setCursor(page.nextCursor);
      } catch {
        setFailed("Couldn't load more scans.");
      }
    });

  if (!everHadRows && rows.length === 0 && !q && status === "all") return <EmptyScans />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label htmlFor={searchId} className="sr-only">
          Search scans by URL
        </label>
        <div className="border-line bg-ink-900 flex h-10 w-full items-center gap-2 rounded-md border px-3 focus-within:border-red-500/70 md:w-80">
          <Icon as={Search} className="text-chrome-500" />
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by URL"
            spellCheck={false}
            className="text-step-n1 text-chrome-100 placeholder:text-chrome-500 h-full min-w-0 flex-1 bg-transparent font-mono outline-none focus-visible:shadow-none"
          />
        </div>
        <div role="radiogroup" aria-label="Filter by status" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={status === f}
              onClick={() => setStatus(f)}
              className={cn(
                "text-step-n2 tracking-label duration-120 ease-out-expo relative h-8 rounded-sm px-2.5 font-mono uppercase transition-colors",
                status === f
                  ? "bg-ink-800 text-chrome-100"
                  : "text-chrome-500 hover:text-chrome-100",
              )}
            >
              {f === "all" ? "All" : statusLabel(f)}
            </button>
          ))}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {failed && (
        <p role="alert" className="text-step-n1 text-red-500">
          {failed}
        </p>
      )}

      <div
        className="border-line overflow-x-auto rounded-lg border"
        aria-busy={loading || undefined}
      >
        <table className="w-full min-w-[40rem] text-left">
          <caption className="sr-only">Your scans, newest first</caption>
          <thead className="border-line bg-ink-900 border-b">
            <tr className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
              <th scope="col" className="px-4 py-3 font-normal">
                URL
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                Created
              </th>
              <th scope="col" className="px-4 py-3 text-right font-normal">
                Duration
              </th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {loading
              ? Array.from({ length: Math.min(5, Math.max(rows.length, 3)) }, (_, i) => (
                  <tr key={`s${i}`}>
                    <td className="px-4 py-3.5">
                      <Skeleton className="h-3.5 w-64" label="Loading scans" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Skeleton className="h-5 w-24" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Skeleton className="h-3.5 w-28" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Skeleton className="ml-auto h-3.5 w-10" />
                    </td>
                  </tr>
                ))
              : rows.map((r) => (
                  <tr
                    key={r.id}
                    className="duration-120 ease-out-expo hover:bg-ink-900/60 group transition-colors"
                  >
                    <td className="max-w-[28rem] px-4 py-3">
                      <Link
                        href={`/app/scans/${r.id}`}
                        className="text-step-n1 text-chrome-100 group-hover:decoration-line block truncate rounded-sm font-mono group-hover:underline group-hover:underline-offset-4"
                      >
                        {r.normalized_url}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} cached={Boolean(r.cached_from)} />
                    </td>
                    <td className="text-step-n1 text-chrome-300 whitespace-nowrap px-4 py-3">
                      <LocalTime iso={r.created_at} />
                    </td>
                    <td className="text-step-n1 text-chrome-300 whitespace-nowrap px-4 py-3 text-right font-mono">
                      {duration(r.created_at, r.finished_at) ?? (
                        <span className="text-chrome-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-step-n1 text-chrome-500 px-4 py-10 text-center">
                  No scans match{" "}
                  {q ? (
                    <span className="text-chrome-300 font-mono">&ldquo;{q}&rdquo;</span>
                  ) : (
                    "this filter"
                  )}
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {cursor && !loading && (
        <Button
          variant="ghost"
          onClick={more}
          loading={loadingMore}
          loadingLabel="Loading"
          className="self-start"
        >
          Load older scans
        </Button>
      )}
    </div>
  );
}

export function ScanTableSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading scans">
      <Skeleton className="h-10 w-80" />
      <div className="border-line rounded-lg border">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="border-line flex items-center gap-6 border-b px-4 py-4 last:border-0"
          >
            <Skeleton className="h-3.5 w-72" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
