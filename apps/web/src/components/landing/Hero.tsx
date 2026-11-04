import { HeroScanForm } from "./HeroScanForm";
import { PixelMark } from "./PixelMark";

const CHIPS = ["Public evidence only", "Detected vs Inferred", "No login bypass"];

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-[90rem] grid-cols-12 items-start gap-x-6 gap-y-12 px-5 pb-16 pt-12 md:px-10 lg:items-center lg:py-16"
    >
      <div className="col-span-12 flex flex-col gap-8 lg:col-span-7">
        <h1
          id="hero-title"
          className="font-display text-step-6 tracking-tightest text-chrome-100 xl:text-step-7 leading-[1.02]"
        >
          Paste a link.
          <br />
          <span className="text-chrome-300">See how it&rsquo;s built.</span>
        </h1>
        <p className="text-step-1 text-chrome-300 max-w-[54ch]">
          RED collects real evidence from any public site, labels what is detected vs inferred, then
          turns it into code and build prompts.
        </p>
        <div className="flex max-w-2xl flex-col gap-4">
          <HeroScanForm />
          <ul aria-label="Scan guarantees" className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <li
                key={c}
                className="border-line text-step-n2 tracking-label text-chrome-300 inline-flex h-7 items-center rounded-sm border px-2.5 font-mono uppercase"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="col-span-12 flex justify-center lg:col-span-5 lg:justify-end">
        {/* Without JS the mark can't wait for visibility; show it assembled. */}
        <noscript>
          <style>{`.red-cell{animation:none}`}</style>
        </noscript>
        <PixelMark className="w-[min(72vw,22rem)] lg:w-[min(30vw,28rem)]" />
      </div>
    </section>
  );
}
