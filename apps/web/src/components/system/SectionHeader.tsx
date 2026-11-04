import type { ReactNode } from "react";

export function SectionHeader({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-line grid grid-cols-12 gap-x-6 gap-y-4 border-t pt-6">
      <span className="text-step-n1 text-chrome-500 col-span-12 font-mono md:col-span-1">{n}</span>
      <h2
        id={`${id}-title`}
        className="font-display text-step-4 tracking-display col-span-12 md:col-span-6"
      >
        {title}
      </h2>
      {children && (
        <div className="text-step-0 text-chrome-300 col-span-12 max-w-prose md:col-span-5 md:pt-2">
          {children}
        </div>
      )}
    </header>
  );
}

export function Specimen({
  label,
  note,
  children,
  className = "",
}: {
  label: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
          {label}
        </span>
        {note && <span className="text-step-n2 text-chrome-500 font-mono">{note}</span>}
      </div>
      {children}
    </div>
  );
}
