"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { validatePublicUrl } from "@red/shared";
import { startScan, type StartScanState } from "@/app/app/actions";
import { UrlInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/** The landing page's URL input, large. Client validation for speed; the server action re-checks with DNS. */
export function ScanForm({ initialUrl, notice }: { initialUrl?: string; notice?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialUrl ?? "");
  const [clientError, setClientError] = useState<string>();
  const [state, action, pending] = useActionState<StartScanState, FormData>(startScan, {
    status: "idle",
  });
  const input = useRef<HTMLInputElement>(null);
  const handled = useRef(0);

  useEffect(() => {
    if (!("at" in state) || state.at === handled.current) return;
    handled.current = state.at;
    if (state.ok) router.push(`/app/scans/${state.scanId}`);
    else input.current?.focus();
  }, [state, router]);

  const serverError = "ok" in state && !state.ok ? state.message : undefined;
  const error = clientError ?? serverError;

  return (
    <form
      action={(fd) => {
        const check = validatePublicUrl(String(fd.get("url") ?? ""));
        if (!check.ok) {
          setClientError(check.message);
          input.current?.focus();
          return;
        }
        setClientError(undefined);
        fd.set("url", check.url);
        return action(fd);
      }}
      noValidate
      className="flex flex-col gap-3"
      aria-label="Start a scan"
    >
      {notice && !error && (
        <p role="status" className="text-step-n1 text-chrome-300">
          {notice}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <UrlInput
          ref={input}
          className="min-w-0 flex-1"
          label="URL to scan"
          hideLabel
          name="url"
          placeholder="https://example.com"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (clientError) setClientError(undefined);
          }}
          error={error}
          disabled={pending}
          enterKeyHint="go"
        />
        <Button
          type="submit"
          size="lg"
          loading={pending}
          loadingLabel="Checking"
          trailing={<Icon as={ArrowRight} size={20} />}
          className="shrink-0"
        >
          Scan
        </Button>
      </div>
      <p className="text-step-n2 text-chrome-500 font-mono">
        https only · public hosts · checked against private and metadata ranges after DNS
      </p>
    </form>
  );
}
