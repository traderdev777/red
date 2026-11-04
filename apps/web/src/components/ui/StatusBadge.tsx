import type { ScanStatus } from "@red/shared";
import { CircleCheck, CircleDashed, CircleX, Loader } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

/**
 * Scan lifecycle badge. Same shell as <Badge>, mapped onto existing tones:
 * queued = chrome (waiting), collecting/analyzing = chrome-100 (working),
 * done = detected green, failed = risk red. No new colors.
 */
const META: Record<
  ScanStatus,
  { label: string; tone: string; icon: typeof Loader; spin?: boolean }
> = {
  queued: { label: "Queued", tone: "text-chrome-300 border-line", icon: CircleDashed },
  collecting: {
    label: "Collecting",
    tone: "text-chrome-100 border-chrome-500/50",
    icon: Loader,
    spin: true,
  },
  analyzing: {
    label: "Analyzing",
    tone: "text-chrome-100 border-chrome-500/50",
    icon: Loader,
    spin: true,
  },
  done: {
    label: "Done",
    tone: "text-detected border-detected/30 bg-detected/[0.06]",
    icon: CircleCheck,
  },
  failed: { label: "Failed", tone: "text-risk border-risk/40 bg-risk/[0.08]", icon: CircleX },
};

export function StatusBadge({
  status,
  cached,
  className,
}: {
  status: ScanStatus;
  cached?: boolean;
  className?: string;
}) {
  const m = META[status];
  return (
    <span
      className={cn(
        "text-step-n2 tracking-label inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 font-mono uppercase",
        m.tone,
        className,
      )}
    >
      <Icon as={m.icon} size={12} className={m.spin ? "motion-safe:animate-spin" : undefined} />
      {m.label}
      {cached && status === "done" ? <span className="text-chrome-500">· cached</span> : null}
    </span>
  );
}

export const statusLabel = (s: ScanStatus) => META[s].label;
