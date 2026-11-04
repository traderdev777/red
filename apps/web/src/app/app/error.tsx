"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function AppError({
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
    <div role="alert" className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-24 md:px-8">
      <p className="text-step-n2 tracking-label font-mono uppercase text-red-500">
        Error{error.digest ? ` · ${error.digest}` : ""}
      </p>
      <h1 className="font-display text-step-4 tracking-display">This view failed to load.</h1>
      <p className="text-step-0 text-chrome-300">
        Your scans and quota are unaffected. Retry the view, or go back to the dashboard.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Retry</Button>
        <a
          href="/app"
          className="text-step-n1 text-chrome-300 hover:text-chrome-100 inline-flex h-10 items-center rounded-md px-4"
        >
          Dashboard
        </a>
      </div>
    </div>
  );
}
