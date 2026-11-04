import { cn } from "@/lib/cn";

/**
 * PLACEHOLDER geometry, drawn to match the supplied RED logo until the
 * production SVG lands. Swap the paths in <Mark> and <Wordmark>; the API stays.
 *
 * Construction: R mark with a pixel trail shedding to the upper left and a
 * </> glyph in the bowl counter; wide geometric wordmark whose E carries the
 * single red bar. Solid fills only, no gradients.
 */

type Variant = "full" | "mark" | "wordmark";

const RED = "rgb(var(--red-500))";
const RED_DEEP = "rgb(var(--red-600))";
const CHROME = "rgb(var(--chrome-100))";
const CHROME_DIM = "rgb(var(--chrome-300))";

function Mark() {
  return (
    <g>
      {/* pixel trail */}
      <rect x="13" y="8" width="5" height="5" fill={RED} />
      <rect x="7" y="14" width="4" height="4" fill={RED} />
      <rect x="13" y="16" width="4" height="4" fill={RED_DEEP} />
      <rect x="2" y="20" width="3" height="3" fill={CHROME_DIM} />
      <rect x="8" y="24" width="3" height="3" fill={CHROME_DIM} />
      {/* bowl + upper stem */}
      <path
        fillRule="evenodd"
        d="M20 10H42C49.18 10 55 15.82 55 23C55 30.18 49.18 36 42 36H31V44H20V10ZM31 19V27H42C44.21 27 46 25.21 46 23C46 20.79 44.21 19 42 19H31Z"
        fill={RED}
      />
      {/* lower stem: chrome, as in the logo */}
      <path d="M20 44H31V56H20Z" fill={CHROME} />
      {/* leg */}
      <path d="M35 36H46.5L58 56H46Z" fill={RED_DEEP} />
      {/* </> in the counter */}
      <path
        d="M35.2 21.2L33.4 23L35.2 24.8M39.6 20.6L37.6 25.4M41.8 21.2L43.6 23L41.8 24.8"
        stroke={CHROME}
        strokeWidth="1.1"
        strokeLinecap="square"
        fill="none"
      />
    </g>
  );
}

function Wordmark() {
  return (
    <g>
      {/* R */}
      <path
        fillRule="evenodd"
        d="M0 0H20C23.31 0 26 2.69 26 6V8C26 11.31 23.31 14 20 14H18.5L26 24H18.8L11.6 14H6V24H0V0ZM6 5V9H19.5C20.33 9 21 8.33 21 7.5V6.5C21 5.67 20.33 5 19.5 5H6Z"
        fill={CHROME}
      />
      {/* E */}
      <path d="M32 0H58V5H38V19H58V24H32V0Z" fill={CHROME} />
      <path d="M42 9.5H58L56.6 14.5H40.6Z" fill={RED} />
      {/* D */}
      <path
        fillRule="evenodd"
        d="M64 0H84C88.42 0 92 3.58 92 8V16C92 20.42 88.42 24 84 24H64V0ZM70 5V19H83C84.66 19 86 17.66 86 16V8C86 6.34 84.66 5 83 5H70Z"
        fill={CHROME}
      />
    </g>
  );
}

const BOX: Record<Variant, { w: number; h: number }> = {
  full: { w: 202, h: 64 },
  mark: { w: 64, h: 64 },
  wordmark: { w: 92, h: 24 },
};

export function Logo({
  variant = "full",
  height = 32,
  title = "RED",
  className,
}: {
  variant?: Variant;
  /** Rendered height in px; width follows the aspect ratio. */
  height?: number;
  title?: string;
  className?: string;
}) {
  const { w, h } = BOX[variant];
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`0 0 ${w} ${h}`}
      height={height}
      width={(height * w) / h}
      className={cn("shrink-0", className)}
    >
      {variant === "mark" && <Mark />}
      {variant === "wordmark" && <Wordmark />}
      {variant === "full" && (
        <>
          <Mark />
          <g transform="translate(78 16) scale(1.3333)">
            <Wordmark />
          </g>
        </>
      )}
    </svg>
  );
}

export function LogoSkeleton({ height = 32, className }: { height?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading logo"
      className={cn("skeleton block", className)}
      style={{ height, width: (height * 202) / 64 }}
    />
  );
}
