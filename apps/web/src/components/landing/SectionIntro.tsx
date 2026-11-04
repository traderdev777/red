import type { ReactNode } from "react";

export function SectionIntro({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5">
      <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
        {eyebrow}
      </span>
      <h2 id={`${id}-title`} className="font-display text-step-5 tracking-display text-chrome-100">
        {title}
      </h2>
      {children && <div className="text-step-1 text-chrome-300 max-w-[60ch]">{children}</div>}
    </header>
  );
}
