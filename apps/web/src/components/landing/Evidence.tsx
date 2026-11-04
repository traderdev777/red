import { Badge } from "@/components/ui/Badge";
import { FindingExplorer } from "./FindingExplorer";
import { SectionIntro } from "./SectionIntro";

export function Evidence() {
  return (
    <section
      id="evidence"
      aria-labelledby="evidence-title"
      className="cv-section mx-auto max-w-[90rem] scroll-mt-16 px-5 py-24 md:px-10"
    >
      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        <div className="col-span-12 flex flex-col gap-10 lg:col-span-5">
          <SectionIntro
            id="evidence"
            eyebrow="Evidence, not guesses"
            title="Every claim shows its work."
          >
            A finding is only as good as what backs it. RED separates what it saw from what it
            concluded, and tells you which one you are reading.
          </SectionIntro>
          <dl className="divide-line border-line flex flex-col divide-y border-y">
            <div className="flex flex-col gap-2 py-5">
              <dt>
                <Badge kind="detected" />
              </dt>
              <dd className="text-step-0 text-chrome-300">
                Observed directly: a header, a file path, a DOM node. The excerpt and its URL are
                attached. You can verify it in your own browser.
              </dd>
            </div>
            <div className="flex flex-col gap-2 py-5">
              <dt>
                <Badge kind="inferred" />
              </dt>
              <dd className="text-step-0 text-chrome-300">
                A judgment drawn from several signals. RED lists the signals and says why it thinks
                so. Treat it as a lead, not a fact.
              </dd>
            </div>
            <div className="flex flex-col gap-2 py-5">
              <dt className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
                Confidence 0–100
              </dt>
              <dd className="text-step-0 text-chrome-300">
                How strongly the evidence supports the claim, with a one-line rationale. Low scores
                stay visible; they are not hidden to make a report look cleaner.
              </dd>
            </div>
          </dl>
        </div>
        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <FindingExplorer />
        </div>
      </div>
    </section>
  );
}
