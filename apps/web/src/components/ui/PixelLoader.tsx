import { cn } from "@/lib/cn";

/**
 * Three pixels stepping in sequence: the in-button loading indicator.
 * Built from the logo's square motif instead of a generic spinner.
 */
export function PixelLoader({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex items-center gap-[3px]", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[5px] w-[5px] bg-current motion-safe:animate-[red-pixel_900ms_steps(1,end)_infinite] motion-reduce:opacity-70"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
