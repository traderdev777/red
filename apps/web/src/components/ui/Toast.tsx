"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

export type ToastTone = "neutral" | "detected" | "inferred" | "risk";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** ms before auto-dismiss. Risk toasts stay until dismissed unless set. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}
export interface ToastItem extends ToastInput {
  id: number;
}

// The animated list (and Framer Motion with it) loads on the first toast, not with the page.
// The live regions below are always mounted, so the first message is still announced.
const ToastList = dynamic(() => import("./ToastList").then((m) => m.ToastList), { ssr: false });

const Ctx = createContext<{
  toast: (t: ToastInput) => number;
  dismiss: (id: number) => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback((t: ToastInput) => {
    const id = ++seq;
    setItems((xs) => [...xs.slice(-3), { ...t, id }]);
    return id;
  }, []);
  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  const polite = items.filter((i) => i.tone !== "risk");
  const urgent = items.filter((i) => i.tone === "risk");

  const [used, setUsed] = useState(false);
  if (items.length > 0 && !used) setUsed(true);

  return (
    <Ctx.Provider value={value}>
      {children}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-6 right-6 z-[90] flex w-[min(24rem,calc(100vw-3rem))] flex-col gap-2"
      >
        <ol aria-live="assertive" className="flex flex-col gap-2">
          {used && <ToastList items={urgent} onDismiss={dismiss} />}
        </ol>
        <ol aria-live="polite" className="flex flex-col gap-2">
          {used && <ToastList items={polite} onDismiss={dismiss} />}
        </ol>
      </section>
    </Ctx.Provider>
  );
}
