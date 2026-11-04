"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Radar, Trash2, Download, Info } from "lucide-react";
import { Button, ButtonSkeleton } from "@/components/ui/Button";
import { UrlInput, UrlInputSkeleton, isValidHttpUrl } from "@/components/ui/Input";
import { Badge, BadgeSkeleton, badgeHint } from "@/components/ui/Badge";
import { Card, CardSkeleton } from "@/components/ui/Card";
import { Tabs, TabsSkeleton } from "@/components/ui/Tabs";
import { CodeBlock, CodeBlockSkeleton } from "@/components/ui/CodeBlock";
import { Tooltip } from "@/components/ui/Tooltip";
import { ConfidenceMeter, ConfidenceMeterSkeleton } from "@/components/ui/ConfidenceMeter";
import { useToast } from "@/components/ui/Toast";
import { Logo, LogoSkeleton } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader } from "./SectionHeader";

function Row({
  name,
  file,
  children,
  desc,
}: {
  name: string;
  file: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <article
      className="border-line grid grid-cols-12 gap-x-6 gap-y-6 border-t py-10"
      aria-labelledby={`c-${name}`}
    >
      <header className="col-span-12 flex flex-col gap-2 lg:col-span-3">
        <h3 id={`c-${name}`} className="text-step-2 text-chrome-100 font-medium">
          {name}
        </h3>
        <p className="text-step-n1 text-chrome-300">{desc}</p>
        <code className="text-step-n2 text-chrome-500 font-mono">{file}</code>
      </header>
      <div className="col-span-12 lg:col-span-9">{children}</div>
    </article>
  );
}

function State({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
        {label}
      </span>
      <div className="flex min-h-12 flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const STATES = "grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 md:grid-cols-3";

function ButtonRow() {
  const variants = [
    { v: "primary" as const, label: "Run scan", icon: Radar },
    { v: "ghost" as const, label: "Export report", icon: Download },
    { v: "danger" as const, label: "Delete scan", icon: Trash2 },
  ];
  return (
    <Row
      name="Button"
      file="components/ui/Button.tsx"
      desc="Primary is the one action on a view. Ghost for the rest. Danger reads as a warning, never as a second primary."
    >
      <div className="flex flex-col gap-10">
        {variants.map(({ v, label, icon }) => (
          <div key={v} className={STATES}>
            <State label={`${v} · default`}>
              <Button variant={v} leading={<Icon as={icon} />}>
                {label}
              </Button>
            </State>
            <State label="hover">
              <Button variant={v} forceState="hover" leading={<Icon as={icon} />}>
                {label}
              </Button>
            </State>
            <State label="focus">
              <Button variant={v} forceState="focus" leading={<Icon as={icon} />}>
                {label}
              </Button>
            </State>
            <State label="disabled">
              <Button variant={v} disabled leading={<Icon as={icon} />}>
                {label}
              </Button>
            </State>
            <State label="loading">
              <Button
                variant={v}
                loading
                loadingLabel={
                  v === "danger" ? "Deleting" : v === "ghost" ? "Exporting" : "Scanning"
                }
              >
                {label}
              </Button>
            </State>
            <State label="skeleton">
              <ButtonSkeleton />
            </State>
          </div>
        ))}
      </div>
    </Row>
  );
}

function InputRow() {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const error =
    touched && value && !isValidHttpUrl(value)
      ? "That isn't a reachable URL. Include a domain, like acme.dev."
      : undefined;
  return (
    <Row
      name="UrlInput"
      file="components/ui/Input.tsx"
      desc="Mono text, because a URL is evidence. Adds https:// on blur when the scheme is missing."
    >
      <div className="flex flex-col gap-10">
        <div className="grid grid-cols-12 gap-6">
          <UrlInput
            className="col-span-12 md:col-span-8"
            label="Target URL · live"
            placeholder="acme.dev/pricing"
            hint="RED follows redirects and records each hop."
            value={value}
            error={error}
            verified={touched && !!value && !error}
            onChange={(e) => setValue(e.target.value)}
            onBlur={(e) => {
              setTouched(true);
              const v = e.currentTarget.value.trim();
              if (v && !/^https?:\/\//i.test(v)) setValue(`https://${v}`);
            }}
          />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <UrlInput label="Default" placeholder="acme.dev" readOnly />
          <UrlInput label="Hover" placeholder="acme.dev" forceState="hover" readOnly />
          <UrlInput label="Focus" defaultValue="https://acme.dev" forceState="focus" readOnly />
          <UrlInput label="Disabled" defaultValue="https://acme.dev" disabled />
          <UrlInput
            label="Loading"
            defaultValue="https://acme.dev"
            loading
            readOnly
            hint="Resolving DNS and redirects"
          />
          <UrlInput label="Error" defaultValue="acme" error="No domain found in “acme”." readOnly />
          <UrlInput
            label="Verified"
            defaultValue="https://acme.dev"
            verified
            readOnly
            hint="200 OK after 1 redirect"
          />
          <div className="flex flex-col gap-2">
            <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
              Skeleton
            </span>
            <UrlInputSkeleton />
          </div>
        </div>
      </div>
    </Row>
  );
}

function BadgeRow() {
  return (
    <Row
      name="Badge"
      file="components/ui/Badge.tsx"
      desc="How a claim was established. Every finding carries exactly one."
    >
      <div className={STATES}>
        {(["detected", "inferred", "risk"] as const).map((k) => (
          <State key={k} label={k}>
            <Badge kind={k} />
            <span className="text-step-n1 text-chrome-500 w-full">{badgeHint(k)}</span>
          </State>
        ))}
        <State label="with count">
          <Badge kind="detected">Detected · 3 sources</Badge>
        </State>
        <State label="skeleton">
          <BadgeSkeleton />
        </State>
      </div>
    </Row>
  );
}

function CardRow() {
  const body =
    "Three stylesheets block first paint on the home route. Inlining critical CSS saves an estimated 1.2s on a 4G profile.";
  const footer = (
    <span className="text-step-n2 text-chrome-500 flex items-center justify-between font-mono">
      3 evidence items <Icon as={ArrowRight} size={12} />
    </span>
  );
  return (
    <Row
      name="Card"
      file="components/ui/Card.tsx"
      desc="Surface for one finding or one group. Interactive cards are a single focus target."
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-3">
          <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Default · interactive
          </span>
          <Card
            interactive
            eyebrow="Performance"
            title="Render-blocking CSS"
            meta={<Badge kind="detected" />}
            footer={footer}
          >
            {body}
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Hover
          </span>
          <Card
            interactive
            forceState="hover"
            eyebrow="Performance"
            title="Render-blocking CSS"
            meta={<Badge kind="detected" />}
            footer={footer}
          >
            {body}
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Focus
          </span>
          <Card
            interactive
            forceState="focus"
            eyebrow="Performance"
            title="Render-blocking CSS"
            meta={<Badge kind="detected" />}
            footer={footer}
          >
            {body}
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Disabled
          </span>
          <Card
            interactive
            disabled
            eyebrow="Security"
            title="Mixed content on /checkout"
            meta={<Badge kind="risk" />}
          >
            Excluded from this report. Re-run the scan with authentication to check the checkout
            flow.
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Static
          </span>
          <Card
            as="section"
            eyebrow="Stack"
            title="Vercel edge, Next.js"
            meta={<Badge kind="inferred" />}
          >
            Inferred from the x-vercel-id header and /_next/ asset paths.
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Skeleton
          </span>
          <CardSkeleton />
        </div>
      </div>
    </Row>
  );
}

const PATCH = `<head>
  <link rel="preload" href="/hero.webp" as="image" fetchpriority="high">
  <style>/* critical: above-the-fold rules, 6.1 KB */</style>
  <link rel="stylesheet" href="/app.css" media="print" onload="this.media='all'">
</head>`;

function TabsRow() {
  return (
    <Row
      name="Tabs"
      file="components/ui/Tabs.tsx"
      desc="Arrow keys move, Home and End jump, disabled tabs are skipped. The red underline is the selection."
    >
      <div className="grid grid-cols-12 gap-6">
        <Tabs
          className="col-span-12 xl:col-span-8"
          label="Finding detail"
          items={[
            {
              id: "summary",
              label: "Summary",
              content: (
                <p className="text-step-0 text-chrome-300 max-w-prose">
                  The hero image is the LCP element on mobile and is lazy-loaded, so the browser
                  discovers it after layout. Preload it and drop loading=&quot;lazy&quot;.
                </p>
              ),
            },
            {
              id: "evidence",
              label: "Evidence",
              count: 3,
              content: (
                <CodeBlock
                  filename="https://acme.dev/ · line 42"
                  language="html"
                  code={`<img src="/hero.webp" loading="lazy" alt="">`}
                  highlight={[1]}
                />
              ),
            },
            {
              id: "fix",
              label: "Fix",
              content: (
                <CodeBlock filename="app/layout.tsx" language="html" code={PATCH} highlight={[2]} />
              ),
            },
            { id: "history", label: "History", disabled: true, content: null },
          ]}
        />
        <div className="col-span-12 flex flex-col gap-3 xl:col-span-4">
          <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Skeleton
          </span>
          <TabsSkeleton />
        </div>
      </div>
    </Row>
  );
}

function CodeRow() {
  return (
    <Row
      name="CodeBlock"
      file="components/ui/CodeBlock.tsx"
      desc="Evidence and patches. Marked lines are the exact bytes a finding cites."
    >
      <div className="grid grid-cols-12 gap-6">
        <CodeBlock
          className="col-span-12 xl:col-span-8"
          filename="response headers · https://acme.dev/"
          language="http"
          highlight={[4]}
          code={`HTTP/2 200
content-type: text/html; charset=utf-8
cache-control: private, no-cache, no-store, max-age=0
set-cookie: sid=9f2c41; Path=/; HttpOnly
x-vercel-id: bom1::iad1::7xk2p
strict-transport-security: max-age=63072000`}
        />
        <div className="col-span-12 flex flex-col gap-3 xl:col-span-4">
          <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Skeleton
          </span>
          <CodeBlockSkeleton />
        </div>
      </div>
    </Row>
  );
}

function TooltipRow() {
  return (
    <Row
      name="Tooltip"
      file="components/ui/Tooltip.tsx"
      desc="Hover opens after 240ms, keyboard focus opens at once, Escape closes."
    >
      <div className={STATES}>
        <State label="hover or focus">
          <Tooltip content="Observed directly in the response headers.">
            <button
              type="button"
              className="text-step-n1 text-chrome-300 hover:text-chrome-100 inline-flex h-8 items-center gap-1.5 rounded-sm px-2"
            >
              <Icon as={Info} /> Source
            </button>
          </Tooltip>
        </State>
        <State label="bottom">
          <Tooltip side="bottom" content="Copies the patch, not the evidence.">
            <Button variant="ghost" size="sm">
              Copy patch
            </Button>
          </Tooltip>
        </State>
        <State label="on disabled">
          <Tooltip content="Available once the scan completes.">
            <span tabIndex={0} className="rounded-md">
              <Button variant="ghost" size="sm" disabled>
                Export
              </Button>
            </span>
          </Tooltip>
        </State>
        <State label="open" className="sm:col-span-2 md:col-span-3">
          <div className="flex w-full justify-center pt-12">
            <Tooltip forceOpen content="Score is 71 because 2 of 3 signals agree.">
              <span className="text-step-n1 text-inferred font-mono">71/100</span>
            </Tooltip>
          </div>
        </State>
      </div>
    </Row>
  );
}

function MeterRow() {
  const [v, setV] = useState(71);
  return (
    <Row
      name="ConfidenceMeter"
      file="components/ui/ConfidenceMeter.tsx"
      desc="0 to 100 in 20 cells. A re-score fills or drains left to right."
    >
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
        <ConfidenceMeter kind="detected" value={96} label="Detected" />
        <ConfidenceMeter kind="inferred" value={v} label="Inferred · live" />
        <ConfidenceMeter kind="risk" value={88} label="Risk" />
        <ConfidenceMeterSkeleton />
        <label className="text-step-n2 text-chrome-500 flex items-center gap-3 font-mono md:col-span-2">
          Re-score
          <input
            type="range"
            min={0}
            max={100}
            value={v}
            onChange={(e) => setV(Number(e.target.value))}
            className="w-48 accent-red-500"
          />
        </label>
      </div>
    </Row>
  );
}

function ToastRow() {
  const { toast } = useToast();
  const fire = [
    {
      tone: "neutral" as const,
      label: "Neutral",
      t: { title: "Scan queued", description: "Position 2. Starts in about 20 seconds." },
    },
    {
      tone: "detected" as const,
      label: "Detected",
      t: { title: "Stack identified", description: "Next.js 14 on Vercel, from 4 signals." },
    },
    {
      tone: "inferred" as const,
      label: "Inferred",
      t: {
        title: "Primary goal inferred",
        description: "Demo bookings. Confirm before RED ranks actions.",
      },
    },
    {
      tone: "risk" as const,
      label: "Risk",
      t: {
        title: "Session cookie lacks Secure",
        description: "Stays until dismissed.",
        action: { label: "Open finding", onClick: () => {} },
      },
    },
  ];
  return (
    <Row
      name="Toast"
      file="components/ui/Toast.tsx"
      desc="Polite by default. Risk toasts are assertive and stay until dismissed. Hover pauses the timer."
    >
      <div className="flex flex-wrap gap-3">
        {fire.map((f) => (
          <Button
            key={f.tone}
            variant="ghost"
            size="sm"
            onClick={() => toast({ tone: f.tone, ...f.t })}
          >
            {f.label}
          </Button>
        ))}
      </div>
    </Row>
  );
}

function LogoRow() {
  return (
    <Row
      name="Logo"
      file="components/ui/Logo.tsx"
      desc="Placeholder geometry until the production SVG is supplied. Swap the paths; the API stays."
    >
      <div className="grid grid-cols-2 items-end gap-8 md:grid-cols-4">
        <State label="full">
          <Logo height={40} />
        </State>
        <State label="mark">
          <Logo variant="mark" height={48} />
        </State>
        <State label="wordmark">
          <Logo variant="wordmark" height={20} />
        </State>
        <State label="skeleton">
          <LogoSkeleton height={40} />
        </State>
      </div>
    </Row>
  );
}

export function ComponentsSection() {
  return (
    <section
      id="components"
      aria-labelledby="components-title"
      className="flex scroll-mt-24 flex-col gap-4"
    >
      <SectionHeader id="components" n="05" title="Components">
        Every component in every state, rendered from the shipping code. Hover and focus columns are
        forced through a data attribute, so what you see is the real style, not a screenshot.
      </SectionHeader>
      <div className="mt-8">
        <ButtonRow />
        <InputRow />
        <BadgeRow />
        <CardRow />
        <TabsRow />
        <CodeRow />
        <TooltipRow />
        <MeterRow />
        <ToastRow />
        <LogoRow />
      </div>
    </section>
  );
}
