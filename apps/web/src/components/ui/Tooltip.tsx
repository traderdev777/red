"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { ease, seconds } from "@/motion/tokens";
import { useReducedMotion } from "@/motion/useReducedMotion";

type Side = "top" | "bottom";

/**
 * Hover or focus to open, Escape to dismiss. The trigger gets aria-describedby.
 * Opens after 240ms on hover (intent), immediately on keyboard focus.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  forceOpen,
  className,
}: {
  content: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  side?: Side;
  /** Gallery only: pin open. */
  forceOpen?: boolean;
  className?: string;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = forceOpen || open;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  if (!isValidElement(children)) return children;

  const trigger = cloneElement(children, {
    "aria-describedby": shown ? id : undefined,
    onPointerEnter: () => show(240),
    onPointerLeave: hide,
    onFocus: () => show(0),
    onBlur: hide,
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      <AnimatePresence>
        {shown && (
          <span
            className={cn(
              "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2",
              side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            )}
          >
            <motion.span
              role="tooltip"
              id={id}
              initial={reduced ? false : { opacity: 0, y: side === "top" ? 4 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
              transition={{ duration: seconds.micro, ease: ease.outExpo }}
              className={cn(
                "border-line bg-ink-800 text-step-n1 text-chrome-100 block w-max max-w-64 rounded-sm border px-3 py-2 leading-snug",
                className,
              )}
            >
              {content}
            </motion.span>
          </span>
        )}
      </AnimatePresence>
    </span>
  );
}
