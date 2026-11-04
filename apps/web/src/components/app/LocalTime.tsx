"use client";

import { useEffect, useState } from "react";

const fmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Server renders UTC (deterministic); the client swaps in local time after mount. */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => setLocal(fmt.format(new Date(iso))), [iso]);
  return (
    <time dateTime={iso} title={iso} className={className}>
      {local ?? `${iso.slice(0, 16).replace("T", " ")} UTC`}
    </time>
  );
}

export function duration(created: string, finished: string | null): string | null {
  if (!finished) return null;
  const s = Math.max(0, Math.round((Date.parse(finished) - Date.parse(created)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
