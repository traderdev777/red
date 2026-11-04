"use client";

import { useState } from "react";
import { Play, RotateCcw, Radar, Square } from "lucide-react";
import { durations } from "@/lib/tokens";
import { cn } from "@/lib/cn";
import { Reveal, PixelDissolve, ScanLine, MagneticButton, useReducedMotion } from "@/motion";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader, Specimen } from "./SectionHeader";

const EASES = [
  {
    name: "out-expo",
    css: "cubic-bezier(0.16, 1, 0.3, 1)",
    d: "M0 100 C16 0, 30 0, 100 0",
    use: "Default. Things arrive fast and settle.",
  },
  {
    name: "in-out-quart",
    css: "cubic-bezier(0.76, 0, 0.24, 1)",
    d: "M0 100 C76 100, 24 0, 100 0",
    use: "Travel between two states: scan passes, tab moves.",
  },
];

function EasingDemo() {
  const [on, setOn] = useState(false);
  return (
    <Specimen label="Easing" note="click to run at 900ms" className="col-span-12 lg:col-span-7">
      <div className="grid gap-4 sm:grid-cols-2">
        {EASES.map((e) => (
          <button
            key={e.name}
            type="button"
            onClick={() => setOn((v) => !v)}
            aria-pressed={on}
            aria-label={`Run ${e.name} easing`}
            className="border-line bg-ink-900 duration-120 ease-out-expo hover:border-chrome-500/50 group flex flex-col gap-4 rounded-lg border p-5 text-left transition-colors"
          >
            <svg viewBox="-4 -4 108 108" className="h-24 w-24" aria-hidden>
              <path d="M0 100 L100 0" stroke="rgb(var(--line))" strokeWidth="1" fill="none" />
              <path d={e.d} stroke="rgb(var(--chrome-100))" strokeWidth="1.5" fill="none" />
            </svg>
            <div className="bg-ink-800 relative h-2 w-full rounded-full">
              <span
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 bg-red-500"
                style={{
                  left: on ? "calc(100% - 12px)" : "0",
                  transition: `left var(--dur-4) ${e.css}`,
                }}
              />
            </div>
            <span className="text-step-n1 text-chrome-100 font-mono">{e.name}</span>
            <span className="text-step-n2 text-chrome-500 font-mono">{e.css}</span>
            <span className="text-step-n1 text-chrome-300">{e.use}</span>
          </button>
        ))}
      </div>
    </Specimen>
  );
}

function DurationDemo() {
  const [run, setRun] = useState(false);
  return (
    <Specimen label="Duration" className="col-span-12 lg:col-span-5 lg:pt-12">
      <ol className="flex flex-col gap-4">
        {durations.map((d, i) => (
          <li key={d.name} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-step-n1 text-chrome-100 font-mono">
                {d.ms}ms <span className="text-chrome-500">· {d.name}</span>
              </span>
              <span className="text-step-n1 text-chrome-500">{d.use}</span>
            </div>
            <div className="bg-ink-800 h-1">
              <span
                className="bg-chrome-300 block h-full"
                style={{
                  width: run ? "100%" : "0%",
                  transition: `width var(--dur-${i + 1}) linear`,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setRun((v) => !v)}
        leading={<Icon as={run ? RotateCcw : Play} />}
      >
        {run ? "Reset" : "Run all four"}
      </Button>
    </Specimen>
  );
}

const EVIDENCE = [
  {
    kind: "detected" as const,
    text: "Next.js 14 App Router",
    src: "x-powered-by header, /_next/ chunk paths",
  },
  {
    kind: "detected" as const,
    text: "No width/height on 11 hero images",
    src: "DOM snapshot, img:not([width])",
  },
  {
    kind: "inferred" as const,
    text: "Pricing page is the main conversion path",
    src: "nav order, 4 CTAs, analytics events",
  },
  {
    kind: "risk" as const,
    text: "Session cookie set without Secure",
    src: "set-cookie: sid=…; HttpOnly",
  },
];

function RevealDemo() {
  const [run, setRun] = useState(0);
  return (
    <Specimen
      label="<Reveal>"
      note="scroll-linked, 60ms stagger"
      className="col-span-12 lg:col-span-6"
    >
      <Reveal
        key={run}
        as="ol"
        className="divide-line border-line bg-ink-900 flex flex-col divide-y rounded-lg border"
      >
        {EVIDENCE.map((e) => (
          <div key={e.text} className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-step-n1 text-chrome-100">{e.text}</span>
              <Badge kind={e.kind} />
            </div>
            <span className="text-step-n2 text-chrome-500 font-mono">{e.src}</span>
          </div>
        ))}
      </Reveal>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setRun((n) => n + 1)}
        leading={<Icon as={RotateCcw} />}
      >
        Replay
      </Button>
    </Specimen>
  );
}

function DissolveDemo() {
  const [resolved, setResolved] = useState(true);
  return (
    <Specimen
      label="<PixelDissolve>"
      note="pending ⇄ resolved"
      className="col-span-12 lg:col-span-6 lg:pt-16"
    >
      <PixelDissolve
        resolved={resolved}
        className="border-line rounded-lg border"
        cols={14}
        rows={7}
      >
        <div className="bg-ink-900 flex flex-col gap-3 p-6">
          <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Performance · high
          </span>
          <p className="text-step-2 text-chrome-100">
            LCP is 4.1s on mobile. The hero image is the LCP element and loads late.
          </p>
          <p className="text-step-n1 text-chrome-300 font-mono">
            {'<img src="/hero.webp" loading="lazy">'}
          </p>
        </div>
      </PixelDissolve>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setResolved((v) => !v)}>
          {resolved ? "Cover" : "Resolve"}
        </Button>
        <span role="status" className="text-step-n2 text-chrome-500 font-mono">
          {resolved ? "Finding resolved" : "Finding pending"}
        </span>
      </div>
    </Specimen>
  );
}

function ScanDemo() {
  const [active, setActive] = useState(true);
  const [determinate, setDeterminate] = useState(false);
  const [progress, setProgress] = useState(42);
  return (
    <Specimen
      label="<ScanLine>"
      note="indeterminate or determinate"
      className="col-span-12 lg:col-span-7"
    >
      <div
        className="border-line bg-ink-900 relative h-72 overflow-hidden rounded-lg border p-5"
        aria-busy={active}
      >
        <div aria-hidden className="flex h-full flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="bg-ink-800 h-3 w-16 rounded-sm" />
            <span className="flex gap-2">
              <span className="bg-ink-800 h-3 w-10 rounded-sm" />
              <span className="bg-ink-800 h-3 w-10 rounded-sm" />
              <span className="bg-ink-800 h-3 w-10 rounded-sm" />
            </span>
          </div>
          <span className="bg-ink-800 mt-4 h-6 w-2/3 rounded-sm" />
          <span className="bg-ink-800 h-3 w-1/2 rounded-sm" />
          <div className="mt-4 grid flex-1 grid-cols-3 gap-3">
            <span className="bg-ink-800 rounded-md" />
            <span className="bg-ink-800 rounded-md" />
            <span className="bg-ink-800 rounded-md" />
          </div>
        </div>
        <ScanLine active={active} progress={determinate ? progress / 100 : undefined} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setActive((v) => !v)}
          leading={<Icon as={active ? Square : Radar} />}
        >
          {active ? "Stop" : "Start"}
        </Button>
        <label className="text-step-n1 text-chrome-300 flex items-center gap-2">
          <input
            type="checkbox"
            checked={determinate}
            onChange={(e) => setDeterminate(e.target.checked)}
            className="accent-red-500"
          />
          Determinate
        </label>
        {determinate && (
          <label className="text-step-n2 text-chrome-500 flex items-center gap-2 font-mono">
            Progress
            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-32 accent-red-500"
            />
          </label>
        )}
        <span role="status" className="text-step-n2 text-chrome-500 font-mono">
          {!active ? "Idle" : determinate ? `Reading DOM · ${progress}%` : "Reading DOM"}
        </span>
      </div>
    </Specimen>
  );
}

const CURSORS = [
  { state: "idle", label: "Idle", note: "Nothing to act on" },
  { state: "action", label: "Action", note: "Links, buttons, tabs" },
  { state: "text", label: "Text", note: "Inputs, editable text" },
  { state: "blocked", label: "Blocked", note: "Disabled controls" },
  { state: "busy", label: "Busy", note: "aria-busy regions" },
];

function CursorDemo() {
  const reduced = useReducedMotion();
  return (
    <Specimen
      label="Magnetic + cursor"
      note={reduced ? "cursor off: reduced motion" : "fine pointers only"}
      className="col-span-12 lg:col-span-5 lg:pt-12"
    >
      <div className="border-line bg-ink-900 flex items-center justify-center rounded-lg border py-10">
        <MagneticButton>
          <Button size="lg" leading={<Icon as={Radar} size={20} />}>
            Run scan
          </Button>
        </MagneticButton>
      </div>
      <ul className="grid grid-cols-5 gap-2">
        {CURSORS.map((c) => (
          <li
            key={c.state}
            data-cursor={c.state}
            className="border-line flex h-24 flex-col justify-between rounded-md border p-2"
          >
            <span className="text-step-n2 tracking-label text-chrome-300 font-mono uppercase">
              {c.label}
            </span>
            <span className="text-step-n2 text-chrome-500 leading-tight">{c.note}</span>
          </li>
        ))}
      </ul>
    </Specimen>
  );
}

export function MotionSection() {
  const reduced = useReducedMotion();
  return (
    <section
      id="motion"
      aria-labelledby="motion-title"
      className="flex scroll-mt-24 flex-col gap-12"
    >
      <SectionHeader id="motion" n="04" title="Motion">
        Motion reports state: something arrived, resolved, is being read, or can be acted on.
        Nothing bounces, nothing fades in for its own sake. Under reduced motion every primitive
        lands on its end state instantly.
        <span
          className={cn(
            "text-step-n2 mt-3 block font-mono",
            reduced ? "text-inferred" : "text-chrome-500",
          )}
        >
          prefers-reduced-motion: {reduced ? "reduce" : "no-preference"}
        </span>
      </SectionHeader>
      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        <EasingDemo />
        <DurationDemo />
        <RevealDemo />
        <DissolveDemo />
        <ScanDemo />
        <CursorDemo />
      </div>
    </section>
  );
}
