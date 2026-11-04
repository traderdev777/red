import type { Metadata, Viewport } from "next";
import { CursorLoader } from "@/motion/CursorLoader";
import { ToastProvider } from "@/components/ui/Toast";
import { site } from "@/lib/site";
import { body, display, mono } from "./fonts";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.title, template: "%s · RED" },
  description: site.description,
  applicationName: site.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: site.title,
    description: site.description,
    url: "/",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: site.title, description: site.description },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#05060A",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="bg-ink-950 font-body text-chrome-100">
        <a
          href="#main"
          className="bg-ink-800 text-step-n1 sr-only z-[110] rounded-sm px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
        <CursorLoader />
      </body>
    </html>
  );
}
