"use client";

import { useEffect } from "react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main
      id="main"
      role="alert"
      className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6"
    >
      <Logo variant="mark" height={40} />
      <p className="text-step-n1 text-chrome-500 font-mono">
        500{error.digest ? ` · ${error.digest}` : ""}
      </p>
      <h1 className="font-display text-step-4 tracking-display">Something broke on our side.</h1>
      <Button onClick={reset} className="self-start">
        Try again
      </Button>
    </main>
  );
}
