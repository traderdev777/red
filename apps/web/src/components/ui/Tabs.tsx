"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { ease, seconds } from "@/motion/tokens";
import { useReducedMotion } from "@/motion/useReducedMotion";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Small mono count shown after the label, e.g. findings per category. */
  count?: number;
  disabled?: boolean;
  content: ReactNode;
}

/**
 * WAI-ARIA tabs: arrow keys move, Home/End jump, disabled tabs are skipped.
 * The red underline travels to the selected tab: it is the selection state.
 */
export function Tabs({
  items,
  defaultValue,
  label,
  className,
}: {
  items: TabItem[];
  defaultValue?: string;
  /** Accessible name for the tablist. */
  label: string;
  className?: string;
}) {
  const uid = useId();
  const reduced = useReducedMotion();
  const enabled = items.filter((i) => !i.disabled);
  const [active, setActive] = useState(defaultValue ?? enabled[0]?.id ?? "");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent) => {
    const idx = enabled.findIndex((i) => i.id === active);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % enabled.length;
    if (e.key === "ArrowLeft") next = (idx - 1 + enabled.length) % enabled.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = enabled.length - 1;
    if (next === null) return;
    e.preventDefault();
    const id = enabled[next]!.id;
    setActive(id);
    refs.current[id]?.focus();
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKey}
        className="border-line flex gap-1 border-b"
      >
        {items.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              role="tab"
              type="button"
              id={`${uid}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              onClick={() => setActive(t.id)}
              className={cn(
                "text-step-n1 relative -mb-px inline-flex h-10 items-center gap-2 rounded-t-sm px-3 font-medium",
                "duration-120 ease-out-expo transition-colors",
                selected ? "text-chrome-100" : "text-chrome-500 hover:text-chrome-300",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="text-step-n2 text-chrome-500 font-mono">{t.count}</span>
              )}
              {selected && (
                <motion.span
                  layoutId={`${uid}-indicator`}
                  className="absolute inset-x-2 bottom-0 h-0.5 bg-red-500"
                  transition={
                    reduced ? { duration: 0 } : { duration: seconds.state, ease: ease.outExpo }
                  }
                />
              )}
            </button>
          );
        })}
      </div>
      {items.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${uid}-panel-${t.id}`}
          aria-labelledby={`${uid}-tab-${t.id}`}
          hidden={t.id !== active}
          tabIndex={0}
          className="pt-6"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}

export function TabsSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading tabs" className={cn("flex flex-col gap-6", className)}>
      <div className="border-line flex gap-4 border-b pb-3">
        <span className="skeleton block h-4 w-16" />
        <span className="skeleton block h-4 w-20" />
        <span className="skeleton block h-4 w-14" />
      </div>
      <span className="skeleton block h-16 w-full" />
    </div>
  );
}
