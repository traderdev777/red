import { cn } from "@/lib/cn";

/** "3 of 5 scans today" with a segmented meter; owners get a mono badge instead. */
export function QuotaIndicator({
  role,
  used,
  limit,
  className,
}: {
  role: "user" | "owner";
  used: number;
  limit: number;
  className?: string;
}) {
  if (role === "owner") {
    return (
      <span
        className={cn(
          "border-line text-step-n2 tracking-label text-chrome-100 inline-flex h-7 items-center rounded-sm border px-2.5 font-mono uppercase",
          className,
        )}
      >
        Owner / unlimited
      </span>
    );
  }
  const shown = Math.min(used, limit);
  const out = used >= limit;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn(
          "text-step-n2 whitespace-nowrap font-mono",
          out ? "text-red-500" : "text-chrome-300",
        )}
      >
        {shown} of {limit} scans today
      </span>
      <span
        role="meter"
        aria-label="Scans used today"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={shown}
        aria-valuetext={`${shown} of ${limit} scans used today`}
        className="hidden gap-0.5 sm:flex"
      >
        {Array.from({ length: Math.min(limit, 20) }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 w-1.5 rounded-[1px]",
              i < shown ? (out ? "bg-red-500" : "bg-chrome-300") : "bg-ink-800",
            )}
          />
        ))}
      </span>
    </div>
  );
}
