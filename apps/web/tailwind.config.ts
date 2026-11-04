import type { Config } from "tailwindcss";

/** Every value here resolves to a CSS variable in src/styles/tokens.css. */
const channel = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // Replace, don't extend: off-system colors and radii must not compile.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      ink: { 950: channel("ink-950"), 900: channel("ink-900"), 800: channel("ink-800") },
      line: channel("line"),
      red: { 500: channel("red-500"), 600: channel("red-600"), 900: channel("red-900") },
      chrome: {
        100: channel("chrome-100"),
        300: channel("chrome-300"),
        500: channel("chrome-500"),
      },
      detected: channel("detected"),
      inferred: channel("inferred"),
      risk: channel("risk"),
    },
    borderRadius: {
      none: "0",
      sm: "var(--radius-sm)",
      md: "var(--radius-md)",
      lg: "var(--radius-lg)",
      full: "9999px",
    },
    fontFamily: {
      display: ["var(--font-display)", "ui-sans-serif", "sans-serif"],
      body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      mono: ["var(--font-mono)", "ui-monospace", "monospace"],
    },
    fontSize: {
      "step-n2": ["var(--step-n2)", { lineHeight: "1.4" }],
      "step-n1": ["var(--step-n1)", { lineHeight: "1.45" }],
      "step-0": ["var(--step-0)", { lineHeight: "1.55" }],
      "step-1": ["var(--step-1)", { lineHeight: "1.45" }],
      "step-2": ["var(--step-2)", { lineHeight: "1.3" }],
      "step-3": ["var(--step-3)", { lineHeight: "1.2" }],
      "step-4": ["var(--step-4)", { lineHeight: "1.12" }],
      "step-5": ["var(--step-5)", { lineHeight: "1.06" }],
      "step-6": ["var(--step-6)", { lineHeight: "1.02" }],
      "step-7": ["var(--step-7)", { lineHeight: "1" }],
    },
    extend: {
      // 4px grid: Tailwind's default spacing scale is already 0.25rem steps.
      letterSpacing: { display: "-0.02em", tightest: "-0.035em", label: "0.08em" },
      boxShadow: {
        none: "none",
        "glow-red": "var(--glow-red)",
        "glow-red-soft": "var(--glow-red-soft)",
        "glow-chrome": "var(--glow-chrome)",
      },
      transitionTimingFunction: {
        "out-expo": "var(--ease-out-expo)",
        "in-out-quart": "var(--ease-in-out-quart)",
      },
      transitionDuration: {
        120: "var(--dur-1)",
        240: "var(--dur-2)",
        480: "var(--dur-3)",
        900: "var(--dur-4)",
      },
    },
  },
  plugins: [],
};

export default config;
