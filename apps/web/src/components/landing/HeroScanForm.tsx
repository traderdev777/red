"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { validatePublicUrl } from "@red/shared";
import { UrlInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { IS_STATIC, APP_URL } from "@/lib/static/mode";

export function HeroScanForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const check = validatePublicUrl(value);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(undefined);
    setValue(check.url);
    const target = `/app?url=${encodeURIComponent(check.url)}`;
    if (IS_STATIC) {
      // Static hosting has no server: hand off to the deployed app, or say so plainly.
      if (APP_URL) {
        setPending(true);
        window.location.assign(`${APP_URL}${target}`);
      } else {
        setError("The scanner isn't deployed yet. Join the waitlist below to hear when it opens.");
      }
      return;
    }
    setPending(true);
    router.push(target);
  };

  return (
    <form
      id="scan"
      onSubmit={submit}
      noValidate
      className="flex scroll-mt-24 flex-col gap-3"
      aria-label="Scan a site"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <UrlInput
          className="min-w-0 flex-1"
          label="Site to scan"
          hideLabel
          name="url"
          placeholder="https://example.com"
          value={value}
          error={error}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(undefined);
          }}
          enterKeyHint="go"
          required
        />
        <Button
          type="submit"
          size="lg"
          loading={pending}
          loadingLabel="Opening"
          trailing={<Icon as={ArrowRight} size={20} />}
          className="w-full shrink-0 sm:w-auto"
        >
          Scan
        </Button>
      </div>
    </form>
  );
}
