import { AssetsSchema, type Assets, type NetworkEntry } from "@red/shared";
import { isThirdParty } from "@red/shared/third-parties";
import { capUrl, hostOf } from "./util";

/** What the page script returns about <script> and stylesheet elements. */
export interface RawAssets {
  scripts: { src: string | null; async: boolean; defer: boolean; type: string | null; inlineBytes: number }[];
  styles: { href: string | null; media: string | null; inlineBytes: number }[];
}

export function buildAssets(raw: RawAssets, network: NetworkEntry[], siteHost: string): Assets {
  const size = new Map<string, number | null>();
  for (const e of network) if (!size.has(e.url)) size.set(e.url, e.transferBytes);
  const external = raw.scripts.filter((s) => s.src);
  const inline = raw.scripts.filter((s) => !s.src && s.type !== "application/ld+json" && s.type !== "application/json");
  const sheets = raw.styles.filter((s) => s.href);
  const inlineStyles = raw.styles.filter((s) => !s.href);
  return AssetsSchema.parse({
    scripts: external.slice(0, 400).map((s) => ({
      url: capUrl(s.src!),
      bytes: size.get(capUrl(s.src!)) ?? null,
      party: isThirdParty(hostOf(s.src!), siteHost) ? "third" : "first",
      async: s.async,
      defer: s.defer,
      module: s.type === "module",
    })),
    inlineScripts: { count: inline.length, bytes: inline.reduce((n, s) => n + s.inlineBytes, 0) },
    stylesheets: sheets.slice(0, 400).map((s) => ({
      url: capUrl(s.href!),
      bytes: size.get(capUrl(s.href!)) ?? null,
      party: isThirdParty(hostOf(s.href!), siteHost) ? "third" : "first",
      media: s.media?.slice(0, 200) ?? null,
    })),
    inlineStyles: { count: inlineStyles.length, bytes: inlineStyles.reduce((n, s) => n + s.inlineBytes, 0) },
  });
}

export const ASSETS_PROBE = `(() => {
  const abs = (u) => { try { return new URL(u, location.href).href } catch { return null } };
  const enc = (t) => new TextEncoder().encode(t || '').length;
  const scripts = [...document.scripts].slice(0, 600).map(s => ({
    src: s.src ? abs(s.getAttribute('src')) : null, async: s.async, defer: s.defer,
    type: s.getAttribute('type'), inlineBytes: s.src ? 0 : enc(s.textContent)
  }));
  const styles = [
    ...[...document.querySelectorAll('link[rel~="stylesheet"][href]')].map(l => ({ href: abs(l.getAttribute('href')), media: l.getAttribute('media'), inlineBytes: 0 })),
    ...[...document.querySelectorAll('style')].map(s => ({ href: null, media: s.getAttribute('media'), inlineBytes: enc(s.textContent) })),
  ].slice(0, 600);
  return { scripts, styles };
})()`;
