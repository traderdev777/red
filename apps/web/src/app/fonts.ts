import localFont from "next/font/local";

/**
 * next/font with self-hosted files (src/fonts, OFL-licensed, from Fontsource).
 * Local files mean no build-time network fetch; next/font still preloads them
 * and generates size-adjusted fallbacks, so swapping in causes no layout shift.
 *
 * Display (18 KB, the LCP h1) and body (45 KB, the hero sub) are preloaded: the
 * body swap otherwise reflowed the hero copy (CLS ~0.04 on mobile). Mono is not:
 * preloading all three queued the render-blocking CSS behind 104 KB of fonts on
 * throttled mobile, and mono text in the hero is single-line, so its swap can't shift.
 */
export const display = localFont({
  src: "../fonts/michroma-latin-400-normal.woff2",
  weight: "400",
  variable: "--font-display",
  // block, not swap: the h1 is the LCP element. With swap it painted in the fallback
  // first and again when Michroma landed, and the second paint (after hydration on
  // throttled mobile) became the LCP. The file is 18 KB and preloaded, so the block
  // window is short in practice; the 3s cap is the worst case.
  display: "block",
  fallback: ["ui-sans-serif", "Arial"],
  adjustFontFallback: "Arial",
});

export const body = localFont({
  src: "../fonts/inter-tight-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-body",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "Arial"],
  adjustFontFallback: "Arial",
});

export const mono = localFont({
  src: "../fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "Menlo", "monospace"],
  adjustFontFallback: false,
  preload: false,
});
