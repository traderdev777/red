"use client";

import { useMemo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { ease, seconds } from "./tokens";
import { useReducedMotion } from "./useReducedMotion";
import { prng } from "./prng";

interface PixelDissolveProps {
  /** true: content resolved and visible. false: content covered by the pixel field. */
  resolved: boolean;
  children: ReactNode;
  cols?: number;
  rows?: number;
  /** Share of cells that flash signal red mid-transition. Keep it under 0.12 (8% red budget). */
  signal?: number;
  /** Total sequence length in seconds. Defaults to the 900ms sequence token. */
  duration?: number;
  /** Stable seed so server and client agree on the cell order. */
  seed?: number;
  onSettled?: () => void;
  className?: string;
}

/**
 * The logo's pixel trail as a state transition. Cells resolve right-to-left
 * with jitter, the way the R mark sheds pixels toward its upper left.
 * Use it where content changes from pending to resolved (or back).
 */
export function PixelDissolve({
  resolved,
  children,
  cols = 16,
  rows = 9,
  signal = 0.08,
  duration = seconds.sequence,
  seed = 7,
  onSettled,
  className,
}: PixelDissolveProps) {
  const reduced = useReducedMotion();

  const cells = useMemo(() => {
    const rand = prng(seed);
    const out: { key: number; delay: number; flash: boolean }[] = [];
    const cellDur = duration * 0.3;
    const spread = duration - cellDur;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const sweep = (cols - 1 - x) / Math.max(1, cols - 1); // 0 at right edge
        const jitter = rand();
        out.push({
          key: y * cols + x,
          delay: Math.min(1, sweep * 0.7 + jitter * 0.3) * spread,
          flash: rand() < signal,
        });
      }
    }
    return out;
  }, [cols, rows, signal, duration, seed]);

  const lastDelay = Math.max(...cells.map((c) => c.delay));
  const cellDur = duration * 0.3;

  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      <div aria-hidden={!resolved || undefined} inert={!resolved || undefined}>
        {children}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {cells.map((c) => (
          <motion.span
            key={c.key}
            className="bg-ink-950 block"
            initial={false}
            animate={
              c.flash && !reduced
                ? {
                    opacity: resolved ? 0 : 1,
                    backgroundColor: [
                      "rgb(var(--ink-950))",
                      "rgb(var(--red-500))",
                      "rgb(var(--ink-950))",
                    ],
                  }
                : { opacity: resolved ? 0 : 1 }
            }
            transition={
              reduced ? { duration: 0 } : { duration: cellDur, delay: c.delay, ease: ease.outExpo }
            }
            onAnimationComplete={c.delay === lastDelay && onSettled ? () => onSettled() : undefined}
          />
        ))}
      </div>
    </div>
  );
}
