"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Icon } from "./Icon";

/** Copy state: idle → copied (detected green check) or failed ("Blocked"), back to idle after 1.8s. */
export function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied("idle"), 1800);
  };

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={copied === "copied" ? "Copied to clipboard" : "Copy code"}
        className="text-step-n2 tracking-label text-chrome-500 duration-120 ease-out-expo hover:bg-ink-800 hover:text-chrome-100 inline-flex h-7 items-center gap-1.5 rounded-sm px-2 font-mono uppercase transition-colors"
      >
        <Icon
          as={copied === "copied" ? Check : Copy}
          size={12}
          className={copied === "copied" ? "text-detected" : undefined}
        />
        <span aria-hidden>
          {copied === "copied" ? "Copied" : copied === "failed" ? "Blocked" : "Copy"}
        </span>
      </button>
      <span role="status" className="sr-only">
        {copied === "copied"
          ? "Copied to clipboard"
          : copied === "failed"
            ? "Clipboard access blocked"
            : ""}
      </span>
    </>
  );
}
