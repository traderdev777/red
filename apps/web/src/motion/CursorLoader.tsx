"use client";

import { useEffect, useState, type ComponentType } from "react";

/**
 * Loads the custom cursor only where it can mean something: a fine pointer
 * with motion allowed. Touch devices never download it.
 */
export function CursorLoader() {
  const [C, setC] = useState<ComponentType | null>(null);
  useEffect(() => {
    const ok =
      window.matchMedia("(pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!ok) return;
    const load = () => import("./Cursor").then((m) => setC(() => m.Cursor));
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (ric) ric(load);
    else setTimeout(load, 1);
  }, []);
  return C ? <C /> : null;
}
