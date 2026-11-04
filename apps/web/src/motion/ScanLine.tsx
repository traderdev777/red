"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { duration, ease } from "./tokens";

const css = (b: readonly number[]) => `cubic-bezier(${b.join(", ")})`;
import { useReducedMotion } from "./useReducedMotion";

interface ScanLineProps {
  /** Run the sweep. When false the line is removed. */
  active: boolean;
  /**
   * 0-1. When set, the line sits at this depth (determinate scan).
   * When omitted, it sweeps top to bottom on a loop (indeterminate scan).
   */
  progress?: number;
  /** Seconds per full pass in indeterminate mode. */
  period?: number;
  /** Stop after this many passes (indeterminate mode). Omit to loop. */
  passes?: number;
  /** Fires when the final pass ends. */
  onDone?: () => void;
  className?: string;
}

/**
 * A 1px signal-red line that sweeps its container top to bottom.
 * Place inside a `relative` parent. It means exactly one thing: RED is reading
 * this region right now. Pair it with a text status for screen readers.
 * Driven by the Web Animations API with the exact token curves (no GSAP in the
 * critical path; GSAP is reserved for ScrollTrigger).
 * Reduced motion: the line holds at the current progress (or the top) without sweeping.
 */
export function ScanLine({
  active,
  progress,
  period = 1.8,
  passes,
  onDone,
  className,
}: ScanLineProps) {
  const root = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = line.current;
    const box = root.current;
    if (!active || !el || !box) return;

    const depth = box.clientHeight;

    if (progress !== undefined) {
      const y = Math.min(1, Math.max(0, progress)) * depth;
      const to = { transform: `translateY(${y}px)`, opacity: 1 };
      if (reduced) Object.assign(el.style, to);
      else {
        const anim = el.animate([to], {
          duration: duration.enter,
          easing: css(ease.outExpo),
          fill: "forwards",
        });
        anim.onfinish = () => {
          Object.assign(el.style, to);
          anim.cancel();
        };
      }
      return;
    }

    if (reduced) {
      // A finite scan has nothing to hold on: report completion without moving.
      if (passes) {
        el.style.opacity = "0";
        onDone?.();
      } else Object.assign(el.style, { transform: "translateY(0)", opacity: "1" });
      return;
    }

    // fade in 8%, sweep 84% (inOutQuart), fade out 8%. Same shape as the GSAP original.
    const anim = el.animate(
      [
        { transform: "translateY(0)", opacity: 0 },
        { transform: "translateY(0)", opacity: 1, offset: 0.08, easing: css(ease.inOutQuart) },
        { transform: `translateY(${depth}px)`, opacity: 1, offset: 0.92 },
        { transform: `translateY(${depth}px)`, opacity: 0 },
      ],
      { duration: period * 1000, iterations: passes ?? Infinity },
    );
    anim.onfinish = () => onDone?.();
    return () => anim.cancel();
    // onDone is a completion callback; re-running the sweep when its identity changes would restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, progress, period, passes, reduced]);

  if (!active) return null;

  return (
    <div
      ref={root}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div ref={line} className="absolute inset-x-0 top-0 opacity-0">
        {/* trail: what has just been read */}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-red-500/10" />
        <div className="shadow-glow-red-soft relative h-px bg-red-500" />
      </div>
    </div>
  );
}
