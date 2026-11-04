import { cn } from "@/lib/cn";

/** Required on every product visual that is not live output. */
export function IllustrationLabel({ className, note }: { className?: string; note?: string }) {
  return (
    <span
      className={cn("text-step-n2 tracking-label text-chrome-500 font-mono uppercase", className)}
    >
      Illustration{note ? ` · ${note}` : ""}
    </span>
  );
}
