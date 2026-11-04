import type { ConfidenceKind } from "@red/shared";
import { clampScore } from "@red/shared";
import { cn } from "@/lib/cn";

const SEGMENTS = 20; // 5 points each: the logo's pixel motif, quantized

const FILL: Record<ConfidenceKind, string> = {
  detected: "bg-detected",
  inferred: "bg-inferred",
  risk: "bg-risk",
};
const TEXT: Record<ConfidenceKind, string> = {
  detected: "text-detected",
  inferred: "text-inferred",
  risk: "text-risk",
};

/**
 * 0-100 confidence, drawn as 20 discrete cells. Segments fill left to right
 * when the value changes, so a re-score is visible as movement.
 */
export function ConfidenceMeter({
  value,
  kind = "detected",
  label = "Confidence",
  showValue = true,
  className,
}: {
  value: number;
  kind?: ConfidenceKind;
  label?: string;
  showValue?: boolean;
  className?: string;
}) {
  const v = clampScore(value);
  const lit = Math.round((v / 100) * SEGMENTS);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
          {label}
        </span>
        {showValue && (
          <span className={cn("text-step-n1 font-mono tabular-nums", TEXT[kind])}>
            {v}
            <span className="text-chrome-500">/100</span>
          </span>
        )}
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-valuetext={`${v} out of 100, ${kind}`}
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${SEGMENTS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "duration-240 ease-out-expo h-2 rounded-[1px] transition-colors",
              i < lit ? FILL[kind] : "bg-ink-800",
            )}
            style={{ transitionDelay: `calc(${i} * var(--dur-1) / 8)` }}
          />
        ))}
      </div>
    </div>
  );
}

export function ConfidenceMeterSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading confidence"
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex justify-between">
        <span className="skeleton block h-3 w-20" />
        <span className="skeleton block h-3 w-12" />
      </div>
      <span className="skeleton block h-2 w-full" />
    </div>
  );
}
