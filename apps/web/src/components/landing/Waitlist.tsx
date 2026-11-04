import { WaitlistForm } from "./WaitlistForm";

export function Waitlist() {
  return (
    <section
      id="waitlist"
      aria-labelledby="waitlist-title"
      className="cv-section border-line scroll-mt-16 border-t"
    >
      <div className="mx-auto grid max-w-[90rem] grid-cols-12 gap-x-6 gap-y-10 px-5 py-24 md:px-10">
        <div className="col-span-12 flex flex-col gap-5 lg:col-span-6">
          <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Waitlist
          </span>
          <h2 id="waitlist-title" className="font-display text-step-5 tracking-display">
            Get the first scans.
          </h2>
          <p className="text-step-1 text-chrome-300 max-w-[46ch]">
            Access opens in waves. Leave an address and we&rsquo;ll tell you when yours is ready,
            along with launch pricing.
          </p>
        </div>
        <div className="relative col-span-12 self-end lg:col-span-5 lg:col-start-8">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
