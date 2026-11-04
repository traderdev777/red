"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "@/motion/useReducedMotion";
import { duration } from "@/motion/tokens";
import { prng } from "@/motion/prng";
import { cn } from "@/lib/cn";

// GSAP arrives after first paint; the mark is already visible without it.
const ScanLine = dynamic(() => import("@/motion/ScanLine").then((m) => m.ScanLine), { ssr: false });

/**
 * The R mark as a pixel field. Three states, each one reported by motion:
 *   assembling  cells fly in right-to-left (the logo's pixel trail, reversed)
 *   reading     one ScanLine pass over the finished mark
 *   idle        cells drift a few px toward the pointer: the mark is live
 * Reduced motion: the finished mark, no pass, no drift.
 *
 * Assembly is pure CSS (no JS before paint); drift writes two custom
 * properties per frame instead of re-rendering cells.
 */

// 13 × 13. b = body (chrome), s = lower stem (bright chrome), l = leg (action red),
// t = trail (signal red), c = trail (chrome). Mirrors the supplied logo.
const BITMAP = [
  "..t..........",
  ".t.bbbbbbbb..",
  "c.tbbbbbbbbb.",
  ".t.bbb....bbb",
  "c..bbb....bbb",
  "...bbb....bbb",
  "...bbbbbbbbb.",
  "...bbbbbbbb..",
  "...sss.lll...",
  "...sss..lll..",
  "...sss...lll.",
  "...sss....lll",
  "...sss....lll",
];
const COLS = 13;
const MAX_DELAY_MS = 420;

const FILL: Record<string, string> = {
  b: "bg-chrome-300",
  s: "bg-chrome-100",
  l: "bg-red-600",
  t: "bg-red-500",
  c: "bg-chrome-500",
};

export function PixelMark({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"waiting" | "assembling" | "reading" | "idle">("waiting");
  const field = useRef<HTMLDivElement>(null);

  const cells = useMemo(() => {
    const rand = prng(41);
    const out: { key: string; style: CSSProperties; className: string }[] = [];
    BITMAP.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === ".") return;
        const sweep = (COLS - 1 - x) / (COLS - 1);
        const tone = ch === "b" ? 0.55 + rand() * 0.45 : 1;
        out.push({
          key: `${x}-${y}`,
          className: FILL[ch] ?? "",
          style: {
            gridColumn: x + 1,
            gridRow: y + 1,
            opacity: tone,
            ["--k" as string]: (0.3 + rand() * 0.7).toFixed(2),
            ["--fx" as string]: `${Math.round(40 + rand() * 120)}px`,
            ["--fy" as string]: `${Math.round((rand() - 0.5) * 140)}px`,
            ["--d" as string]: `${Math.round(sweep * 320 + rand() * 100)}ms`,
          },
        });
      }),
    );
    return out;
  }, []);

  // Assemble when the mark is first on screen (below the fold on phones), not before.
  useEffect(() => {
    const el = field.current;
    if (!el || phase !== "waiting") return;
    if (reduced) {
      setPhase("idle");
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setPhase("assembling");
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, phase]);

  useEffect(() => {
    if (reduced || phase !== "assembling") return;
    const t = setTimeout(() => setPhase("reading"), MAX_DELAY_MS + duration.enter);
    return () => clearTimeout(t);
  }, [reduced, phase]);

  // Idle drift toward the pointer, eased with a per-frame lerp.
  useEffect(() => {
    const el = field.current;
    if (reduced || phase !== "idle" || !el) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let tx = 0,
      ty = 0,
      x = 0,
      y = 0,
      raf = 0;
    const tick = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      el.style.setProperty("--mx", x.toFixed(3));
      el.style.setProperty("--my", y.toFixed(3));
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced, phase]);

  return (
    <div
      className={cn("relative", className)}
      role="img"
      aria-label="The RED mark, an R built from pixel squares"
    >
      <div
        ref={field}
        aria-hidden
        data-phase={phase}
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
          ["--mx" as string]: 0,
          ["--my" as string]: 0,
        }}
      >
        {cells.map((c) => (
          <span
            key={c.key}
            className="block"
            style={{
              ...c.style,
              opacity: undefined,
              transform:
                "translate3d(calc(var(--mx) * var(--k) * 7px), calc(var(--my) * var(--k) * 7px), 0)",
            }}
          >
            <span
              className={cn("red-cell block aspect-square rounded-[2px]", c.className)}
              style={{ ...c.style, gridColumn: undefined, gridRow: undefined }}
            />
          </span>
        ))}
      </div>
      {phase === "reading" && (
        <ScanLine
          active
          passes={1}
          period={1.4}
          onDone={() => setPhase("idle")}
          className="-inset-x-3"
        />
      )}
    </div>
  );
}
