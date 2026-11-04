/**
 * Motion tokens. Mirrors the --ease-* and --dur-* variables in tokens.css
 * for JS-driven animation (Framer Motion, GSAP).
 */
export const ease = {
  outExpo: [0.16, 1, 0.3, 1] as const,
  inOutQuart: [0.76, 0, 0.24, 1] as const,
};

/** GSAP accepts CSS cubic-bezier strings via CustomEase; we use the closest built-ins. */
export const gsapEase = {
  outExpo: "expo.out",
  inOutQuart: "quart.inOut",
};

/** Durations in milliseconds. */
export const duration = {
  micro: 120,
  state: 240,
  enter: 480,
  sequence: 900,
} as const;

/** Durations in seconds, for Framer Motion and GSAP. */
export const seconds = {
  micro: duration.micro / 1000,
  state: duration.state / 1000,
  enter: duration.enter / 1000,
  sequence: duration.sequence / 1000,
} as const;

export type DurationToken = keyof typeof duration;
