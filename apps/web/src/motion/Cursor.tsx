"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/cn";

/**
 * Cursor states. Resolved from the element under the pointer:
 *   data-cursor="..." wins; otherwise semantics decide.
 *   idle    nothing interactive
 *   action  links, buttons, tabs: ring expands, turns signal red
 *   text    inputs and editable text: collapses to a caret bar
 *   blocked disabled controls: dashed chrome ring
 *   busy    aria-busy regions: ring shows a rotating arc
 */
export type CursorState = "idle" | "action" | "text" | "blocked" | "busy";

function resolveState(target: EventTarget | null): CursorState {
  if (!(target instanceof Element)) return "idle";
  const explicit = target.closest<HTMLElement>("[data-cursor]");
  if (explicit?.dataset.cursor) return explicit.dataset.cursor as CursorState;
  if (target.closest("[aria-busy='true']")) return "busy";
  if (target.closest(":disabled, [aria-disabled='true']")) return "blocked";
  if (
    target.closest(
      "input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable='true']",
    )
  )
    return "text";
  if (target.closest("a[href], button, [role='button'], [role='tab'], summary, label[for]"))
    return "action";
  return "idle";
}

const RING: Record<CursorState, string> = {
  idle: "h-7 w-7 border-chrome-500/60",
  action: "h-11 w-11 border-red-500 shadow-glow-red-soft",
  text: "h-6 w-0.5 rounded-sm border-0 bg-chrome-100",
  blocked: "h-7 w-7 border-dashed border-chrome-500",
  busy: "h-8 w-8 border-chrome-500/40 border-t-red-500 animate-spin",
};

export function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<CursorState>("idle");
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 900, damping: 50, mass: 0.3 });
  const ry = useSpring(y, { stiffness: 900, damping: 50, mass: 0.3 });

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setEnabled(fine.matches && !calm.matches);
    sync();
    fine.addEventListener("change", sync);
    calm.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      calm.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (!enabled) {
      html.classList.remove("has-red-cursor");
      return;
    }
    html.classList.add("has-red-cursor");

    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
      setState(resolveState(e.target));
    };
    const leave = () => setVisible(false);
    const down = () => setPressed(true);
    const up = () => setPressed(false);

    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      html.classList.remove("has-red-cursor");
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100]">
      <motion.div
        className="absolute left-0 top-0"
        style={{ x: rx, y: ry, opacity: visible ? 1 : 0 }}
      >
        <div
          className={cn(
            "duration-240 ease-out-expo -translate-x-1/2 -translate-y-1/2 rounded-full border transition-[width,height,border-color,background-color,box-shadow,transform]",
            RING[state],
            pressed && state !== "text" && "scale-75",
          )}
        />
      </motion.div>
      <motion.div className="absolute left-0 top-0" style={{ x, y, opacity: visible ? 1 : 0 }}>
        <div
          className={cn(
            "bg-chrome-100 h-1 w-1 -translate-x-1/2 -translate-y-1/2",
            state === "action" && "bg-red-500",
            state === "text" && "opacity-0",
          )}
        />
      </motion.div>
    </div>
  );
}
