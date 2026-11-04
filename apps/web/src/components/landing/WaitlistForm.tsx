"use client";

import { useActionState, useEffect, useRef } from "react";
import { joinWaitlist } from "@/app/actions/waitlist";
import { SOURCES, type WaitlistState } from "@/lib/waitlistSchema";
import { EmailInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

function currentSource(): string {
  const s = new URLSearchParams(window.location.search).get("source") ?? "landing";
  return (SOURCES as readonly string[]).includes(s) ? s : "landing";
}

export function WaitlistForm() {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, {
    status: "idle",
  });
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const lastAt = useRef(0);

  useEffect(() => {
    if (state.status === "idle" || state.at === lastAt.current) return;
    lastAt.current = state.at;
    if (state.status === "ok") {
      toast({ tone: "detected", title: "Added to the waitlist", description: state.message });
      formRef.current?.reset();
    } else if (state.status === "duplicate") {
      toast({
        tone: "neutral",
        title: state.message,
        description: "Same address, no second email.",
      });
    } else {
      toast({ tone: "risk", title: "Not added", description: state.message, duration: 6000 });
    }
  }, [state, toast]);

  return (
    <form
      ref={formRef}
      action={(fd) => {
        fd.set("source", currentSource());
        return action(fd);
      }}
      noValidate
      className="flex flex-col gap-3"
      aria-describedby="waitlist-status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <EmailInput
          className="min-w-0 flex-1"
          label="Work email"
          hideLabel
          name="email"
          placeholder="you@company.com"
          required
          disabled={pending}
          error={state.status === "error" && state.field === "email" ? state.message : undefined}
        />
        <Button
          type="submit"
          size="lg"
          loading={pending}
          loadingLabel="Joining"
          className="shrink-0"
        >
          Join the waitlist
        </Button>
      </div>
      {/* Honeypot, hidden from people and assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <p id="waitlist-status" role="status" className="text-step-n1 text-chrome-300 min-h-6">
        {state.status === "idle" ? "One email when RED opens. No newsletter." : state.message}
      </p>
    </form>
  );
}
