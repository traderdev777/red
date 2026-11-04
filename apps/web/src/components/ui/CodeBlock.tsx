import { cn } from "@/lib/cn";
import { CopyButton } from "./CopyButton";

// Server-renderable: only the copy button hydrates, so long snippets cost no JS.

export interface CodeBlockProps {
  code: string;
  language?: string;
  /** File path or URL the snippet belongs to. Shown in the header, mono. */
  filename?: string;
  /** 1-based line numbers to mark as the evidence lines. */
  highlight?: number[];
  showLineNumbers?: boolean;
  /** Soft-wrap long lines instead of scrolling. For narrow previews. */
  wrap?: boolean;
  className?: string;
}

export function CodeBlock({
  code,
  language,
  filename,
  highlight = [],
  showLineNumbers = true,
  wrap = false,
  className,
}: CodeBlockProps) {
  const lines = code.replace(/\n$/, "").split("\n");
  const marked = new Set(highlight);

  return (
    <figure className={cn("border-line bg-ink-900 overflow-hidden rounded-lg border", className)}>
      <figcaption className="border-line flex h-10 items-center justify-between gap-4 border-b pl-4 pr-1.5">
        <span className="text-step-n1 text-chrome-300 truncate font-mono">
          {filename ?? language ?? "snippet"}
        </span>
        <div className="flex items-center gap-3">
          {language && filename && (
            <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
              {language}
            </span>
          )}
          <CopyButton code={code} />
        </div>
      </figcaption>
      <pre
        className="text-step-n1 overflow-x-auto py-3 leading-6"
        tabIndex={0}
        aria-label={filename ? `Code: ${filename}` : "Code"}
      >
        <code className={cn("grid font-mono", !wrap && "min-w-max")}>
          {lines.map((line, i) => {
            const n = i + 1;
            const hit = marked.has(n);
            return (
              <span
                key={n}
                className={cn(
                  "flex border-l-2 pr-6",
                  hit ? "border-red-500 bg-red-900/25" : "border-transparent",
                )}
              >
                {showLineNumbers && (
                  <span
                    aria-hidden
                    className="text-chrome-500 w-12 shrink-0 select-none pr-4 text-right"
                  >
                    {n}
                  </span>
                )}
                <span
                  className={cn(
                    wrap ? "min-w-0 whitespace-pre-wrap break-words" : "whitespace-pre",
                    hit ? "text-chrome-100" : "text-chrome-300",
                    !showLineNumbers && "pl-4",
                  )}
                >
                  {line || " "}
                </span>
              </span>
            );
          })}
        </code>
      </pre>
    </figure>
  );
}

export function CodeBlockSkeleton({
  lines = 5,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading code"
      className={cn("border-line bg-ink-900 overflow-hidden rounded-lg border", className)}
    >
      <div className="border-line flex h-10 items-center border-b px-4">
        <span className="skeleton block h-3 w-40" />
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className="skeleton block h-3"
            style={{ width: `${55 + ((i * 37) % 40)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
