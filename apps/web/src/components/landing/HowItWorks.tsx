import { CodeBlock } from "@/components/ui/CodeBlock";
import { HowItWorksClient } from "./HowItWorksClient";
import { IllustrationLabel } from "./IllustrationLabel";
import { SectionIntro } from "./SectionIntro";
import { steps } from "./steps";

/** Server shell: snippets render here as static HTML; the client part only drives the pin. */
export function HowItWorks() {
  const intro = (
    <div className="grid grid-cols-12 gap-x-6 gap-y-10">
      <div className="col-span-12 lg:col-span-7">
        <SectionIntro
          id="how-it-works"
          eyebrow="How it works"
          title="Five passes. One evidence trail."
        >
          Every stage writes down what it saw. Nothing reaches a finding without a source attached.
        </SectionIntro>
      </div>
    </div>
  );
  const panels = steps.map((s) => (
    <div key={s.id} className="flex flex-col gap-2">
      <IllustrationLabel note="log format" />
      <CodeBlock filename={s.file} code={s.snippet} showLineNumbers={false} />
    </div>
  ));
  return <HowItWorksClient intro={intro} panels={panels} />;
}
