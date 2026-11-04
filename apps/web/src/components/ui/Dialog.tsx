"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Native <dialog> as a modal: the browser provides the focus trap, Esc to close,
 * and inert background. We add: focus returns to the opener, click on the
 * backdrop closes, and an initial-focus target.
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  initialFocus,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  initialFocus?: React.RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      initialFocus?.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open, initialFocus]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onDialogClose = () => {
      onClose();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
    d.addEventListener("close", onDialogClose);
    return () => d.removeEventListener("close", onDialogClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className={cn(
        "text-chrome-100 backdrop:bg-ink-950/70 m-0 max-h-none max-w-none bg-transparent p-0 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      {open ? children : null}
    </dialog>
  );
}
