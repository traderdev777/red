"use client";

import { useRef, type ReactNode, type PointerEvent } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "./useReducedMotion";

interface MagneticButtonProps {
  children: ReactNode;
  /** 0-1. How far the child follows the pointer, as a share of the offset. */
  strength?: number;
  className?: string;
}

/**
 * Pulls its child toward the pointer while the pointer is inside it.
 * Reserved for the single primary action on a screen: the pull says
 * "this is the target". Disabled for coarse pointers and reduced motion.
 */
export function MagneticButton({ children, strength = 0.22, className }: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 320, damping: 22, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 320, damping: 22, mass: 0.4 });

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={cn("inline-block", className)}
      onPointerMove={onMove}
      onPointerLeave={reset}
      style={reduced ? undefined : { x: sx, y: sy }}
    >
      {children}
    </motion.div>
  );
}
