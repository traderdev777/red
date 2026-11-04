import { ScanLine } from "@/motion/ScanLine";

/** No scans yet. The faint line says "ready to read", nothing more. */
export function EmptyScans() {
  return (
    <div className="border-line bg-ink-900/40 relative overflow-hidden rounded-lg border border-dashed px-6 py-16">
      <div className="opacity-40">
        <ScanLine active period={3.2} />
      </div>
      <div className="relative flex max-w-md flex-col gap-2">
        <p className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
          History · empty
        </p>
        <p className="text-step-1 text-chrome-100">
          No scans yet. Paste a URL to run your first one.
        </p>
      </div>
    </div>
  );
}
