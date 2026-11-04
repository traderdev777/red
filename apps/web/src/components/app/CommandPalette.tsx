"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { History, LogOut, ScanSearch, type LucideIcon } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  run: () => void;
}

/** Cmd/Ctrl+K. A combobox over a short command list: type to filter, arrows to move, Enter to run. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const signOut = useRef<HTMLFormElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const titleId = useId();

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "new",
        label: "New scan",
        hint: "/app",
        icon: ScanSearch,
        run: () => {
          router.push("/app?focus=1");
        },
      },
      {
        id: "scans",
        label: "Go to scans",
        hint: "/app/scans",
        icon: History,
        run: () => router.push("/app/scans"),
      },
      {
        id: "signout",
        label: "Sign out",
        hint: "ends this session",
        icon: LogOut,
        run: () => signOut.current?.requestSubmit(),
      },
    ],
    [router],
  );

  const shown = commands.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));
  const close = () => {
    setQ("");
    setActive(0);
    onClose();
  };
  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    c.run();
  };

  return (
    <>
      <form ref={signOut} action="/auth/signout" method="post" hidden />
      <Dialog
        open={open}
        onClose={close}
        labelledBy={titleId}
        initialFocus={input}
        className="mx-auto mt-[15vh] w-[min(36rem,calc(100vw-2rem))]"
      >
        <div className="border-line bg-ink-900 shadow-glow-red-soft overflow-hidden rounded-lg border">
          <h2 id={titleId} className="sr-only">
            Command palette
          </h2>
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={shown[active] ? `${listId}-${shown[active].id}` : undefined}
            aria-autocomplete="list"
            aria-label="Type a command"
            placeholder="Type a command"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => (shown.length ? (i + 1) % shown.length : 0));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => (shown.length ? (i - 1 + shown.length) % shown.length : 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(shown[active]);
              }
            }}
            className="border-line text-step-0 text-chrome-100 placeholder:text-chrome-500 h-14 w-full border-b bg-transparent px-5 font-mono outline-none"
          />
          <ul id={listId} role="listbox" aria-label="Commands" className="p-2">
            {shown.length === 0 && (
              <li className="text-step-n1 text-chrome-500 px-3 py-3">No command matches.</li>
            )}
            {shown.map((c, i) => (
              <li
                key={c.id}
                id={`${listId}-${c.id}`}
                role="option"
                aria-selected={i === active}
                onPointerMove={() => setActive(i)}
                onClick={() => run(c)}
                className={cn(
                  "text-step-0 relative flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5",
                  i === active ? "bg-ink-800 text-chrome-100" : "text-chrome-300",
                )}
              >
                {i === active && (
                  <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 bg-red-500" />
                )}
                <Icon as={c.icon} />
                <span className="flex-1">{c.label}</span>
                <span className="text-step-n2 text-chrome-500 font-mono">{c.hint}</span>
              </li>
            ))}
          </ul>
          <p className="border-line text-step-n2 text-chrome-500 border-t px-5 py-2 font-mono">
            ↑↓ to move · Enter to run · Esc to close
          </p>
        </div>
      </Dialog>
    </>
  );
}
