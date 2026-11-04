# RED design system

RED reads a website, cites what it found, and turns findings into build actions.
The interface has one job: make evidence legible and the next action obvious.
This document is the contract. The live reference is `/system` (dev only).

---

## 1. Source of truth

| Layer       | File                             | Role                                                                                                                           |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Tokens      | `apps/web/src/styles/tokens.css` | Every color, type step, radius, glow, easing, and duration. The only place values live.                                        |
| Tailwind    | `apps/web/tailwind.config.ts`    | Maps utilities to the CSS variables. The palette and radii are **replaced**, not extended, so off-system values don't compile. |
| Motion (JS) | `apps/web/src/motion/tokens.ts`  | Mirrors easings and durations for JS-driven motion (WAAPI, Framer Motion, GSAP).                                               |
| Manifest    | `apps/web/src/lib/tokens.ts`     | Documentation only. `/system` reads the live CSS variables and flags any token that drifted from this list.                    |

Colors are stored as RGB channels (`--red-500: 255 31 31`) so alpha works everywhere:
`bg-red-500/10` in Tailwind, `rgb(var(--red-500) / 0.12)` in CSS.

---

## 2. Color

Taken from the mark: black, signal red, chrome.

| Token          | Hex       | Role                                                       | Contrast on ink-950 |
| -------------- | --------- | ---------------------------------------------------------- | ------------------- |
| `--ink-950`    | `#05060A` | Page                                                       | n/a                 |
| `--ink-900`    | `#0B0D13` | Surface                                                    | n/a                 |
| `--ink-800`    | `#141821` | Raised                                                     | n/a                 |
| `--line`       | `#232936` | Borders, dividers                                          | n/a (non-text)      |
| `--red-500`    | `#FF1F1F` | Signal: focus, risk, scan line, active tab                 | 5.3:1               |
| `--red-600`    | `#D10F0F` | Action fill: primary button (chrome-100 text on it: 5.0:1) | 3.7:1               |
| `--red-900`    | `#5A0707` | Tint: evidence line highlight, danger border               | n/a                 |
| `--chrome-100` | `#F2F5FA` | Primary text                                               | 18.5:1              |
| `--chrome-300` | `#C9D0DC` | Secondary text                                             | 13.1:1              |
| `--chrome-500` | `#8A93A6` | Labels, meta, placeholders                                 | 6.6:1               |
| `--detected`   | `#3DDC97` | Observed directly                                          | 11.5:1              |
| `--inferred`   | `#FFB020` | Derived from signals                                       | 11.1:1              |
| `--risk`       | `#FF1F1F` | Liability (aliases red-500 on purpose)                     | 5.3:1               |

**Rules**

- One red. `red-500` signals, `red-600` fills the single primary action, `red-900` tints. Nothing else is red.
- Red covers at most **8%** of any screen. If a view needs more to read, the hierarchy is wrong.
- Red is never decoration: no red dividers, backgrounds, or icons at rest.
- No purple. No blue-to-purple gradients. No rainbow or multi-hue charts.
- Status colors mean status only. Never use `detected` green as a "success" accent elsewhere.
- Elevation is a step in ink lightness plus one 1px `line` border. No drop shadows.
- Never use chrome text below `chrome-500`, and never put opacity on `chrome-500` text: it drops under 4.5:1.

---

## 3. Typography

| Family                    | Token          | Use                                                                                                                                              |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Michroma 400              | `font-display` | Wordmark, one hero line, section titles. Rationed. Tracking `-0.02em` (`tracking-display`), `-0.035em` at hero size (`tracking-tightest`).       |
| Inter Tight (variable)    | `font-body`    | Everything you read: UI, prose, labels in sentence case.                                                                                         |
| JetBrains Mono (variable) | `font-mono`    | Everything RED observed: code, URLs, headers, selectors, scores, counts, timestamps. Uppercase mono with `tracking-label` (0.08em) for eyebrows. |

Fonts load through `next/font/local` from `apps/web/src/fonts` (OFL files from Fontsource), so dev and build never fetch from Google and fallbacks are metric-matched. Michroma uses `display: block` (it paints the LCP headline once, not twice); Inter Tight and JetBrains Mono use `swap`. Michroma and Inter Tight are preloaded; JetBrains Mono is not.

**Scale.** Ratio 1.25 at a 1440px viewport, 1.2 at 360px, fluid between with `clamp()`.

| Step      | Max (1440px) | Use                                          |
| --------- | ------------ | -------------------------------------------- |
| `step-7`  | 76.3px       | Hero, once per page                          |
| `step-6`  | 61.0px       | Page title                                   |
| `step-5`  | 48.8px       | Display section title                        |
| `step-4`  | 39.1px       | Section title, large figures                 |
| `step-3`  | 31.3px       | Body section title, stats                    |
| `step-2`  | 25.0px       | Card title, lead                             |
| `step-1`  | 20.0px       | Subhead                                      |
| `step-0`  | 16.0px       | Body                                         |
| `step-n1` | 12.8px       | UI text, captions                            |
| `step-n2` | 11.0px       | Mono labels, eyebrows (floor; never smaller) |

---

## 4. Space, radius, glow

- **Grid:** 4px base. Use Tailwind's spacing units (1 unit = 4px). Layout is a 12-column grid with 24px gutters.
- **Radius:** `rounded-sm` 4px (badges, tooltips, inline controls), `rounded-md` 8px (buttons, inputs, toasts), `rounded-lg` 14px (cards, code blocks, panels). No other values exist.
- **Glow, not shadow:**
  - `shadow-glow-red`: focus ring. 1px red edge at 55%, 4px halo at 12%, 24px bloom at 12%.
  - `shadow-glow-red-soft`: active or hovered primary, scan line.
  - `shadow-glow-chrome`: neutral selection edge.
- Every focusable element shows `glow-red` on `:focus-visible`. Don't remove it; restyle it.

---

## 5. Motion

**Rule: every animation reports a state.** Something arrived, resolved, is being read, changed value, or can be acted on. No decorative bounce, no fade-ins for their own sake.

| Token               | Value                            | Use                                                    |
| ------------------- | -------------------------------- | ------------------------------------------------------ |
| `ease-out-expo`     | `cubic-bezier(0.16, 1, 0.3, 1)`  | Default. Arrivals and settles.                         |
| `ease-in-out-quart` | `cubic-bezier(0.76, 0, 0.24, 1)` | Travel between two states: scan passes, tab indicator. |
| `duration-120`      | 120ms                            | Hover, press, color shifts                             |
| `duration-240`      | 240ms                            | Tabs, toggles, tooltips, cursor                        |
| `duration-480`      | 480ms                            | Reveals, toasts, determinate scan                      |
| `duration-900`      | 900ms                            | Pixel dissolve, multi-step sequences                   |

**Reduced motion.** Under `prefers-reduced-motion: reduce` the `--dur-*` variables drop to 0ms, every primitive renders its end state, and the custom cursor turns off. A CSS guard keeps reveal items visible from first paint, before hydration.

### Primitives (`apps/web/src/motion`)

| Primitive                     | State it reports                               | Notes                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Reveal>`                    | This content just entered the reading position | Scroll-linked via `whileInView`, 60ms stagger, 12px travel plus a clip wipe. Lists render `<li>` items.                                                                                                              |
| `<PixelDissolve resolved>`    | Pending to resolved, or back                   | The mark's pixel trail. Cells resolve right to left with seeded jitter (no hydration drift); about 8% flash signal red mid-transition.                                                                               |
| `<ScanLine active progress?>` | RED is reading this region now                 | Web Animations API with the exact token curves. `passes` stops after N sweeps and fires `onDone`. Indeterminate loop, or determinate when `progress` (0 to 1) is set. Pair it with a text status for screen readers. |
| `<MagneticButton>`            | This is the target                             | One per view, on the primary action. Mouse only.                                                                                                                                                                     |
| `<Cursor>`                    | What the pointer is over                       | States: `idle`, `action`, `text`, `blocked`, `busy`. Resolved from semantics or `data-cursor`. Fine pointers only; off under reduced motion.                                                                         |

---

## 6. Components (`apps/web/src/components/ui`)

Every component ships default, hover, focus, disabled, and a `*Skeleton` loading state.
Hover and focus can be forced with `forceState` (gallery use) through a `data-force` attribute,
so `/system` shows the real styles, not mockups.

| Component         | Key behavior                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`          | `primary` / `ghost` / `danger`, `sm` / `md` / `lg`. `loading` keeps the width, shows the pixel loader, sets `aria-busy`. One primary per view.                          |
| `UrlInput`        | Mono text, `type="url"`, adds `https://` on blur when the scheme is missing. States: error, loading (resolving), verified. Exposes `normalizeUrl` and `isValidHttpUrl`. |
| `Badge`           | `detected` / `inferred` / `risk`. Every finding carries exactly one.                                                                                                    |
| `Card`            | Eyebrow, title, meta slot, footer. `interactive` makes it one focus target.                                                                                             |
| `Tabs`            | WAI-ARIA: arrow keys, Home and End, disabled tabs skipped. The red underline travels with the selection.                                                                |
| `CodeBlock`       | Line numbers, highlighted evidence lines, copy button with Copied and Blocked states announced to screen readers.                                                       |
| `Tooltip`         | Opens on hover after 240ms, on focus at once; Escape closes; wires `aria-describedby`.                                                                                  |
| `ConfidenceMeter` | 0 to 100 in 20 cells, colored by kind, `role="meter"`. Cells fill left to right on change.                                                                              |
| `Toast`           | `ToastProvider` plus `useToast()`. Polite by default; `risk` is assertive and persists. Hover or focus pauses the timer.                                                |
| `Logo`            | `full` / `mark` / `wordmark`. **Placeholder geometry** until the production SVG is supplied: swap the paths in `Mark` and `Wordmark`; the API stays.                    |
| `Icon`            | The only icon entry point. Lucide at a fixed 1.5px stroke, sizes 12/16/20/24, decorative unless `label` is set.                                                         |

---

## 7. Anti-template checklist

Every screen passes these before review.

1. **No emoji as icons.** Lucide only, through `<Icon>`, which locks the stroke at 1.5px.
2. **No stock gradients.** Solid fills. The only gradient is the scan line's 10% trail, and it means "just read".
3. **No purple, no rainbow.** The Tailwind palette is replaced; off-system colors don't compile.
4. **One red, under 8% of the screen.**
5. **No "Welcome to..." copy.** Lead with what RED found or what to do next.
6. **No decorative motion.** Name the state an animation reports, or cut it.
7. **On the grid.** 4px spacing, 12 columns, radii 4/8/14. Arbitrary values need a reason in review.
8. **No centered card grids.** Asymmetric spans, a reading column, an index rail. Rhythm comes from offsets.
9. **Engineer-to-engineer voice.** Short, precise, cites the source.

### Voice

| Write                                                        | Not                                 |
| ------------------------------------------------------------ | ----------------------------------- |
| 3 stylesheets block first paint on `/`.                      | Let's supercharge your site speed!  |
| Inferred from the `x-vercel-id` header and `/_next/` paths.  | We think you might be using Vercel. |
| That isn't a reachable URL. Include a domain, like acme.dev. | Oops! Something went wrong.         |
| Available once the scan completes.                           | Coming soon!                        |

Numbers beat adjectives. Name the source. Say what to do next.

---

## 8. Accessibility baseline

- Text contrast is 4.5:1 or better on every surface (see the table in section 2).
- Visible focus on every interactive element (`glow-red`).
- Skip link to `#main`. Landmarks on every page.
- Live regions: toasts (polite or assertive), copy confirmation, scan status.
- Reduced motion honored by every primitive and by the cursor.
- Checked with axe-core (WCAG 2 A/AA plus best practices) on `/system`: 0 violations.

## Landing page (`/`)

Sections, in order: Nav, Hero, How it works, Evidence, Actions, Trust and limits, Pricing, Waitlist, Footer.
Everything is a Server Component except: `Nav` (scroll state, mobile menu), `HeroScanForm`,
`PixelMark`, `HowItWorksClient` (pin only; its snippets are server-rendered and passed in),
`FindingExplorer`, `WaitlistForm`, and `CopyButton` inside `CodeBlock`.

Motion budget on this page, and what each one says:

| Motion                                                   | State it reports                            | Reduced motion        |
| -------------------------------------------------------- | ------------------------------------------- | --------------------- |
| Nav 64 → 52px                                            | You've left the top                         | Instant               |
| PixelMark assembly (CSS, starts when on screen)          | The mark is being put together              | Rendered assembled    |
| One ScanLine pass over the mark                          | RED reads                                   | Skipped, reports done |
| Pixel drift toward pointer (fine pointers only)          | The mark is live                            | Off                   |
| How it works pin + red rail (GSAP ScrollTrigger, ≥768px) | Which stage you're reading, how far through | Plain vertical list   |
| Finding swap, confidence fill                            | Which finding the evidence belongs to       | Instant               |
| Reveal on Actions                                        | Content arrived at reading position         | Static                |
| Toast                                                    | Waitlist result                             | Instant               |

Rules this page keeps:

- Every product visual that isn't live output carries an `Illustration` label in mono.
- Red is the R's leg and trail, primary buttons, the scan line, the progress rail, highlighted evidence lines. Measured at ≤2% of any 1440×900 viewport.
- No prices, metrics, logos, or testimonials. Pricing says "Pricing announced at launch."
- URL validation lives in `packages/shared/src/url.ts` and runs on the client (hero form) and the server (`/scan`). The scanner must call it again after DNS resolution.
- Framer Motion and GSAP are not in the landing page's first load. Framer loads with the first toast or the custom cursor; GSAP loads only when the How it works section pins.

## App shell (`/app`)

| Piece         | Rule                                                                                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar       | 240 ↔ 64px, width persisted in a cookie so the server renders the right width (no shift). Active item: 2px red bar at the left edge, never a filled block. Disabled items show their reason in mono ("Coming in a later build"). |
| Top bar       | Breadcrumb in mono uppercase. Quota "N of M scans today" + segmented meter; the meter turns red only at the limit. Owners see `OWNER / UNLIMITED` instead.                                                                       |
| Mobile        | Sidebar becomes a bottom sheet (native `<dialog>`: focus trapped, Esc closes, focus returns to the opener).                                                                                                                      |
| ⌘K / Ctrl+K   | Command palette: combobox + listbox, arrows/Enter/Esc. New scan, Go to scans, Sign out.                                                                                                                                          |
| Status badge  | queued = chrome, collecting/analyzing = chrome-100 with a spinner (spin off under reduced motion), done = detected green, failed = risk red.                                                                                     |
| PixelDissolve | Only when a scan changes phase (queued → running → done/failed). Progress ticks and ordinary navigation never dissolve.                                                                                                          |
| ScanLine      | Active stepper cell while the scanner reports that stage; faint (40%) loop in the empty history panel.                                                                                                                           |
| Empty states  | Say what is true and what to do next. No sample rows, no placeholder findings.                                                                                                                                                   |
| Time          | Server renders UTC; the client swaps in local time after mount (no hydration mismatch).                                                                                                                                          |
