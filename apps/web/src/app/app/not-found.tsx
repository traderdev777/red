import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-24 md:px-8">
      <p className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">404 · app</p>
      <h1 className="font-display text-step-4 tracking-display">Nothing here.</h1>
      <Link
        href="/app"
        className="text-step-n1 text-chrome-100 decoration-line self-start rounded-sm font-mono underline underline-offset-4"
      >
        New scan
      </Link>
    </div>
  );
}
