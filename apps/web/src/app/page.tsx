import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Evidence } from "@/components/landing/Evidence";
import { Actions } from "@/components/landing/Actions";
import { Trust } from "@/components/landing/Trust";
import { Pricing } from "@/components/landing/Pricing";
import { Waitlist } from "@/components/landing/Waitlist";
import { Footer } from "@/components/landing/Footer";
import { site } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: site.name,
  url: site.url,
  description: site.description,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
};

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Evidence />
        <Actions />
        <Trust />
        <Pricing />
        <Waitlist />
      </main>
      <Footer />
      <script
        type="application/ld+json"
        // Static object, no user input: safe to inline.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
