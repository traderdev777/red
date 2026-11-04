"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, ScanSearch, GitMerge, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { ease, seconds } from "@/motion/tokens";
import { useReducedMotion } from "@/motion/useReducedMotion";
import { Icon } from "./Icon";
import type { ToastItem, ToastTone } from "./Toast";

const TONE: Record<ToastTone, { icon: LucideIcon; text: string; bar: string }> = {
  neutral: { icon: Info, text: "text-chrome-300", bar: "bg-chrome-500" },
  detected: { icon: ScanSearch, text: "text-detected", bar: "bg-detected" },
  inferred: { icon: GitMerge, text: "text-inferred", bar: "bg-inferred" },
  risk: { icon: TriangleAlert, text: "text-risk", bar: "bg-risk" },
};

export function ToastList({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {items.map((t) => (
        <ToastView key={t.id} item={t} reduced={reduced} onDismiss={() => onDismiss(t.id)} />
      ))}
    </AnimatePresence>
  );
}

function ToastView({
  item,
  reduced,
  onDismiss,
}: {
  item: ToastItem;
  reduced: boolean;
  onDismiss: () => void;
}) {
  const tone = TONE[item.tone ?? "neutral"];
  const duration = item.duration ?? (item.tone === "risk" ? 0 : 5000);
  const [paused, setPaused] = useState(false);

  return (
    <motion.li
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 24 }}
      transition={{ duration: seconds.state, ease: ease.outExpo }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="border-line bg-ink-800 pointer-events-auto relative overflow-hidden rounded-md border"
    >
      <div className="flex gap-3 p-4">
        <Icon as={tone.icon} className={cn("mt-0.5 shrink-0", tone.text)} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-step-n1 text-chrome-100 font-medium">{item.title}</p>
          {item.description && <p className="text-step-n1 text-chrome-300">{item.description}</p>}
          {item.action && (
            <button
              type="button"
              onClick={() => {
                item.action!.onClick();
                onDismiss();
              }}
              className="text-step-n2 tracking-label text-chrome-100 decoration-line hover:decoration-chrome-300 mt-1 self-start rounded-sm font-mono uppercase underline underline-offset-4"
            >
              {item.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="text-chrome-500 hover:bg-ink-900 hover:text-chrome-100 -m-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm"
        >
          <Icon as={X} />
        </button>
      </div>
      {duration > 0 && (
        <span
          aria-hidden
          onAnimationEnd={onDismiss}
          className={cn("absolute bottom-0 left-0 h-px w-full origin-left", tone.bar)}
          style={{
            animation: `red-toast-timer ${duration}ms linear forwards`,
            animationPlayState: paused ? "paused" : "running",
          }}
        />
      )}
    </motion.li>
  );
}
