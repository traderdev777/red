import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Interactive cards are focusable, show hover/focus, and act as a single target. */
  interactive?: boolean;
  disabled?: boolean;
  as?: "article" | "section" | "div";
  eyebrow?: ReactNode;
  title?: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
  forceState?: "hover" | "focus";
}

export function Card({
  interactive,
  disabled,
  as: Tag = "article",
  eyebrow,
  title,
  meta,
  footer,
  forceState,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-disabled={disabled || undefined}
      data-force={forceState}
      data-cursor={interactive && !disabled ? "action" : undefined}
      className={cn(
        "border-line bg-ink-900 relative flex flex-col gap-4 rounded-lg border p-6",
        interactive &&
          "duration-120 ease-out-expo hover:border-chrome-500/50 hover:bg-ink-800 focus-visible:shadow-glow-red data-[force=hover]:border-chrome-500/50 data-[force=hover]:bg-ink-800 data-[force=focus]:shadow-glow-red transition-[border-color,background-color,box-shadow] focus-visible:border-red-500/60 data-[force=focus]:border-red-500/60",
        disabled && "opacity-40",
        className,
      )}
      {...rest}
    >
      {(eyebrow || title || meta) && (
        <header className="flex flex-col gap-2">
          {(eyebrow || meta) && (
            <div className="flex min-h-6 items-center justify-between gap-4">
              {eyebrow ? (
                <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
                  {eyebrow}
                </span>
              ) : (
                <span />
              )}
              {meta}
            </div>
          )}
          {title && <h3 className="text-step-1 text-chrome-100 font-medium">{title}</h3>}
        </header>
      )}
      {children && <div className="text-step-0 text-chrome-300">{children}</div>}
      {footer && <footer className="border-line border-t pt-4">{footer}</footer>}
    </Tag>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading card"
      className={cn("border-line bg-ink-900 flex flex-col gap-4 rounded-lg border p-6", className)}
    >
      <span className="skeleton block h-3 w-24" />
      <span className="skeleton block h-5 w-3/4" />
      <span className="skeleton block h-4 w-full" />
      <span className="skeleton block h-4 w-5/6" />
    </div>
  );
}
