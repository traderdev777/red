import type { ConfidenceKind } from "@red/shared";
import { ScanSearch, GitMerge, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

const META: Record<
  ConfidenceKind,
  { label: string; icon: LucideIcon; tone: string; hint: string }
> = {
  detected: {
    label: "Detected",
    icon: ScanSearch,
    tone: "text-detected border-detected/30 bg-detected/[0.06]",
    hint: "Observed directly in the page, headers, or network trace.",
  },
  inferred: {
    label: "Inferred",
    icon: GitMerge,
    tone: "text-inferred border-inferred/30 bg-inferred/[0.06]",
    hint: "Derived from multiple signals. Check the evidence before acting.",
  },
  risk: {
    label: "Risk",
    icon: TriangleAlert,
    tone: "text-risk border-risk/40 bg-risk/[0.08]",
    hint: "A liability: security, legal, or a measurable loss.",
  },
};

export function badgeHint(kind: ConfidenceKind) {
  return META[kind].hint;
}

export function Badge({
  kind,
  children,
  className,
}: {
  kind: ConfidenceKind;
  /** Override the label, e.g. "Detected · 3 sources". */
  children?: React.ReactNode;
  className?: string;
}) {
  const m = META[kind];
  return (
    <span
      className={cn(
        "text-step-n2 tracking-label inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 font-mono uppercase",
        m.tone,
        className,
      )}
    >
      <Icon as={m.icon} size={12} />
      {children ?? m.label}
    </span>
  );
}

export function BadgeSkeleton({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading status"
      className={cn("skeleton block h-6 w-20", className)}
    />
  );
}
