/**
 * Token manifest for documentation and verification only.
 * The values that ship are in styles/tokens.css. The /system gallery reads the
 * live CSS variables and flags any token here that has drifted from them.
 */
export interface ColorToken {
  name: string;
  hex: string;
  role: string;
  group: "ink" | "red" | "chrome" | "status";
}

export const colorTokens: ColorToken[] = [
  { name: "ink-950", hex: "#05060A", role: "Page", group: "ink" },
  { name: "ink-900", hex: "#0B0D13", role: "Surface", group: "ink" },
  { name: "ink-800", hex: "#141821", role: "Raised", group: "ink" },
  { name: "line", hex: "#232936", role: "Borders, dividers", group: "ink" },
  { name: "red-500", hex: "#FF1F1F", role: "Signal: focus, risk, the scan line", group: "red" },
  { name: "red-600", hex: "#D10F0F", role: "Action fill: primary button", group: "red" },
  {
    name: "red-900",
    hex: "#5A0707",
    role: "Tint: evidence highlight, danger border",
    group: "red",
  },
  { name: "chrome-100", hex: "#F2F5FA", role: "Primary text", group: "chrome" },
  { name: "chrome-300", hex: "#C9D0DC", role: "Secondary text", group: "chrome" },
  { name: "chrome-500", hex: "#8A93A6", role: "Meta, labels, placeholders", group: "chrome" },
  { name: "detected", hex: "#3DDC97", role: "Observed directly", group: "status" },
  { name: "inferred", hex: "#FFB020", role: "Derived from signals", group: "status" },
  { name: "risk", hex: "#FF1F1F", role: "Liability (aliases red-500)", group: "status" },
];

export const typeSteps = [
  { step: "step-7", use: "Hero, once per page" },
  { step: "step-6", use: "Page title" },
  { step: "step-5", use: "Section title (display)" },
  { step: "step-4", use: "Large figure, score" },
  { step: "step-3", use: "Section title (body)" },
  { step: "step-2", use: "Card title, lead" },
  { step: "step-1", use: "Subhead" },
  { step: "step-0", use: "Body" },
  { step: "step-n1", use: "UI text, captions" },
  { step: "step-n2", use: "Mono labels, eyebrows" },
] as const;

export const spaceScale = [4, 8, 12, 16, 24, 32, 48, 64, 96] as const;
export const radii = [
  { name: "sm", px: 4, use: "Badges, tooltips, inline controls" },
  { name: "md", px: 8, use: "Buttons, inputs, toasts" },
  { name: "lg", px: 14, use: "Cards, code blocks, panels" },
] as const;

export const durations = [
  { name: "micro", ms: 120, use: "Hover, press, color shifts" },
  { name: "state", ms: 240, use: "Tabs, toggles, tooltips, cursor" },
  { name: "enter", ms: 480, use: "Reveals, toasts, determinate scan" },
  { name: "sequence", ms: 900, use: "Pixel dissolve, multi-step" },
] as const;

/** WCAG relative luminance contrast ratio between two hex colors. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
