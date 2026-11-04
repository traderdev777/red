"use client";

import { Children, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface RevealProps {
  children: ReactNode;
  /** Delay between children, in seconds. */
  stagger?: number;
  /** Vertical travel in px. Kept small: the move signals arrival, not spectacle. */
  distance?: number;
  /** Fraction of the element that must be visible before it reveals. */
  amount?: number;
  /** Reveal every time it re-enters, instead of once. */
  repeat?: boolean;
  className?: string;
  as?: "div" | "section" | "ul" | "ol";
}

/**
 * Scroll-linked reveal. Communicates "this content just entered your reading
 * position" by settling each child into place in document order.
 *
 * IntersectionObserver + CSS transitions on the motion tokens (--dur-3,
 * --ease-out-expo): no animation library on the page for this. Under
 * prefers-reduced-motion the --dur-* tokens are 0 and globals.css pins
 * [data-reveal-item] to its end state, so content is simply there.
 * Before hydration (and without JS) items render visible: nothing hides
 * until the observer is live.
 */
export function Reveal({
  children,
  stagger = 0.06,
  distance = 12,
  amount = 0.25,
  repeat = false,
  className,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");
  const items = Children.toArray(children);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Already on screen at mount: leave it alone rather than blink it out.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      setState("shown");
      if (!repeat) return;
    } else setState("hidden");
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setState("shown");
          if (!repeat) io.disconnect();
        } else if (repeat) setState("hidden");
      },
      { threshold: amount },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [amount, repeat]);

  const Item = Tag === "ul" || Tag === "ol" ? "li" : "div";
  return (
    <Tag ref={ref as never} className={className} data-reveal={state}>
      {items.map((child, i) => (
        <Item
          key={i}
          data-reveal-item=""
          className={cn(
            "ease-out-expo transition-[opacity,transform,clip-path] duration-[var(--dur-3)]",
            state === "hidden" &&
              "translate-y-[var(--reveal-d)] opacity-0 [clip-path:inset(0_0_100%_0)]",
          )}
          style={
            {
              "--reveal-d": `${distance}px`,
              transitionDelay: state === "shown" ? `${i * stagger}s` : "0s",
            } as CSSProperties
          }
        >
          {child}
        </Item>
      ))}
    </Tag>
  );
}
