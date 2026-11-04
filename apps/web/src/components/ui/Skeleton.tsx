import { cn } from "@/lib/cn";

/** Placeholder block for pending content. Shimmer stops under reduced motion. */
export function Skeleton({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("skeleton block h-4 w-full", className)} />
  );
}
