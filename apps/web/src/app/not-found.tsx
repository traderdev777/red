import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6">
      <Logo variant="mark" height={40} />
      <p className="text-step-n1 text-chrome-500 font-mono">404 · no route matched</p>
      <h1 className="font-display text-step-4 tracking-display">Nothing at this address.</h1>
      <Link
        href="/"
        className="text-step-n1 text-chrome-300 decoration-line hover:text-chrome-100 self-start rounded-sm font-mono underline underline-offset-4"
      >
        Back to root
      </Link>
    </main>
  );
}
