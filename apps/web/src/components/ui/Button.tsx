import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PixelLoader } from "./PixelLoader";

export type ButtonVariant = "primary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the pixel loader, keeps width, blocks clicks, sets aria-busy. */
  loading?: boolean;
  /** Label read while loading, e.g. "Scanning". Defaults to the children. */
  loadingLabel?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Gallery only: render a pseudo-state without user input. */
  forceState?: "hover" | "focus";
}

const base =
  "group relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border font-body font-medium tracking-[-0.005em] " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-120 ease-out-expo " +
  "focus-visible:shadow-glow-red data-[force=focus]:shadow-glow-red " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-40 aria-busy:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  // The action. One per view.
  primary:
    "border-red-600 bg-red-600 text-chrome-100 hover:border-red-500 hover:shadow-glow-red-soft data-[force=hover]:border-red-500 data-[force=hover]:shadow-glow-red-soft",
  // Everything secondary.
  ghost:
    "border-line bg-transparent text-chrome-100 hover:border-chrome-500/60 hover:bg-ink-800 data-[force=hover]:border-chrome-500/60 data-[force=hover]:bg-ink-800",
  // Destructive. Red text on ink: reads as a warning, never competes with primary.
  danger:
    "border-red-900 bg-ink-900 text-red-500 hover:border-red-500 hover:bg-red-900/40 data-[force=hover]:border-red-500 data-[force=hover]:bg-red-900/40",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-step-n1",
  md: "h-10 px-4 text-step-0",
  lg: "h-12 px-6 text-step-1",
};

/** Button styling for elements that navigate (<a>, <Link>). Same tokens, same states. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    loadingLabel,
    leading,
    trailing,
    forceState,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      data-force={forceState}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {leading}
        {children}
        {trailing}
      </span>
      {loading && (
        <span className="absolute inset-0 inline-flex items-center justify-center gap-2">
          <PixelLoader />
          <span className="sr-only">{loadingLabel ?? "Working"}</span>
          {loadingLabel && <span aria-hidden>{loadingLabel}</span>}
        </span>
      )}
    </button>
  );
});

export function ButtonSkeleton({
  size = "md",
  className,
}: {
  size?: ButtonSize;
  className?: string;
}) {
  const h = { sm: "h-8 w-20", md: "h-10 w-28", lg: "h-12 w-36" }[size];
  return (
    <span
      role="status"
      aria-label="Loading action"
      className={cn("skeleton block rounded-md", h, className)}
    />
  );
}
