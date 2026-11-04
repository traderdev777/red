"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { Globe, CircleAlert, CircleCheck, Mail, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";
import { PixelLoader } from "./PixelLoader";

export interface UrlInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  label: string;
  /** Visually hide the label (it stays available to assistive tech). */
  hideLabel?: boolean;
  hint?: string;
  /** Error message. Presence switches the field into its error state. */
  error?: string;
  /** Field is resolving the URL (DNS, redirect chain). */
  loading?: boolean;
  /** URL has been resolved and is reachable. */
  verified?: boolean;
  forceState?: "hover" | "focus";
}

/** Prepends https:// when the scheme is missing. Leaves anything else untouched. */
export function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return v;
  return /^[a-z][a-z\d+\-.]*:\/\//i.test(v) ? v : `https://${v}`;
}

export function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(normalizeUrl(raw));
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export const UrlInput = forwardRef<HTMLInputElement, UrlInputProps>(function UrlInput(
  {
    label,
    hideLabel,
    hint,
    error,
    loading,
    verified,
    forceState,
    disabled,
    className,
    onBlur,
    id,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const [focused, setFocused] = useState(false);
  const state = error ? "error" : verified ? "verified" : "idle";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={inputId}
        className={cn(
          "text-step-n2 tracking-label text-chrome-500 font-mono uppercase",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </label>
      <div
        data-force={forceState}
        data-state={state}
        data-focused={focused || undefined}
        aria-disabled={disabled || undefined}
        className={cn(
          "border-line bg-ink-900 group flex h-12 items-center gap-3 rounded-md border px-4",
          "duration-120 ease-out-expo transition-[border-color,box-shadow,background-color]",
          "hover:border-chrome-500/50 data-[force=hover]:border-chrome-500/50",
          "data-[focused]:shadow-glow-red data-[force=focus]:shadow-glow-red data-[focused]:border-red-500/70 data-[force=focus]:border-red-500/70",
          "data-[state=error]:border-red-500",
          "aria-disabled:pointer-events-none aria-disabled:opacity-40",
        )}
      >
        <Icon
          as={Globe}
          className="text-chrome-500 group-data-[focused]:text-chrome-100 shrink-0"
        />
        <input
          ref={ref}
          id={inputId}
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          autoCapitalize="none"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? hintId : undefined}
          aria-busy={loading || undefined}
          className="text-step-0 text-chrome-100 placeholder:text-chrome-500 h-full min-w-0 flex-1 bg-transparent font-mono outline-none focus-visible:shadow-none"
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            const n = normalizeUrl(e.currentTarget.value);
            if (n !== e.currentTarget.value && rest.value === undefined) e.currentTarget.value = n;
            onBlur?.(e);
          }}
          {...rest}
        />
        {loading && <PixelLoader className="text-chrome-300" />}
        {!loading && state === "verified" && (
          <Icon as={CircleCheck} className="text-detected" label="Reachable" />
        )}
        {!loading && state === "error" && (
          <Icon as={CircleAlert} className="text-red-500" label="Invalid" />
        )}
      </div>
      {(error || hint) && (
        <p id={hintId} className={cn("text-step-n1", error ? "text-red-500" : "text-chrome-500")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});

export function UrlInputSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading field" className={cn("flex flex-col gap-2", className)}>
      <span className="skeleton block h-3 w-24" />
      <span className="skeleton block h-12 w-full rounded-md" />
    </div>
  );
}

export interface EmailInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  icon?: LucideIcon;
}

/** Same field shell as UrlInput, body font, for email. */
export const EmailInput = forwardRef<HTMLInputElement, EmailInputProps>(function EmailInput(
  { label, hideLabel, hint, error, icon = Mail, disabled, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const [focused, setFocused] = useState(false);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={inputId}
        className={cn(
          "text-step-n2 tracking-label text-chrome-500 font-mono uppercase",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </label>
      <div
        data-state={error ? "error" : "idle"}
        data-focused={focused || undefined}
        aria-disabled={disabled || undefined}
        className={cn(
          "border-line bg-ink-900 group flex h-12 items-center gap-3 rounded-md border px-4",
          "duration-120 ease-out-expo hover:border-chrome-500/50 transition-[border-color,box-shadow]",
          "data-[focused]:shadow-glow-red data-[focused]:border-red-500/70 data-[state=error]:border-red-500",
          "aria-disabled:pointer-events-none aria-disabled:opacity-40",
        )}
      >
        <Icon as={icon} className="text-chrome-500 group-data-[focused]:text-chrome-100 shrink-0" />
        <input
          ref={ref}
          id={inputId}
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          autoCapitalize="none"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? hintId : undefined}
          className="text-step-0 text-chrome-100 placeholder:text-chrome-500 h-full min-w-0 flex-1 bg-transparent outline-none focus-visible:shadow-none"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
      </div>
      {(error || hint) && (
        <p id={hintId} className={cn("text-step-n1", error ? "text-red-500" : "text-chrome-500")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
