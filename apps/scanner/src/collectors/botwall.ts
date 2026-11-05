/**
 * Bot-wall detection. When a protection service answers instead of the site,
 * the scan FAILS with an honest message. There is no retry, no solver, no
 * header or fingerprint change: RED does not bypass protections.
 */
export interface BotWallInput {
  status: number | null;
  headers: Record<string, string>; // lower-cased names
  title: string | null;
  /** First ~64KB of the document body. */
  htmlHead: string;
}

export interface BotWall {
  vendor: "cloudflare" | "akamai" | "datadome" | "perimeterx" | "imperva" | "sucuri" | "aws-waf" | "captcha";
  signal: string;
}

export function detectBotWall(i: BotWallInput): BotWall | null {
  const h = i.headers;
  const html = i.htmlHead;
  const title = (i.title ?? "").trim().toLowerCase();
  const blockedStatus = i.status === 403 || i.status === 429 || i.status === 503;

  if (h["cf-mitigated"] === "challenge") return { vendor: "cloudflare", signal: "cf-mitigated: challenge" };
  if (/challenges\.cloudflare\.com\/cdn-cgi\/challenge-platform|window\._cf_chl_opt|cf-chl-widget|id="challenge-form"/i.test(html))
    return { vendor: "cloudflare", signal: "challenge-platform markup" };
  if ((h["server"] ?? "").toLowerCase() === "cloudflare" && blockedStatus && /just a moment|attention required|access denied/.test(title))
    return { vendor: "cloudflare", signal: `status ${i.status}, title "${title}"` };

  if ("x-datadome" in h || /captcha-delivery\.com|geo\.captcha-delivery\.com|ct\.captcha-delivery/i.test(html))
    return { vendor: "datadome", signal: "x-datadome / captcha-delivery.com" };

  if (/px-captcha|_pxCaptcha|perimeterx\.net|"blockScript"|px-cloud\.net\/captcha/i.test(html) && blockedStatus)
    return { vendor: "perimeterx", signal: "px-captcha markup" };

  if (/_Incapsula_Resource|incident_id=.*incapsula|Request unsuccessful\. Incapsula incident ID/i.test(html))
    return { vendor: "imperva", signal: "Incapsula resource" };

  if ((h["server"] ?? "").toLowerCase().startsWith("akamaighost") && blockedStatus && /access denied|reference #/i.test(title + html.slice(0, 4000)))
    return { vendor: "akamai", signal: "AkamaiGHost access denied" };
  if (/akamai/i.test(h["server"] ?? "") && /_abck|bm-verify|sec-if-cpt-container/i.test(html) && blockedStatus)
    return { vendor: "akamai", signal: "Akamai Bot Manager challenge" };

  if ("x-sucuri-id" in h && blockedStatus && /sucuri website firewall|access denied/i.test(title + html.slice(0, 4000)))
    return { vendor: "sucuri", signal: "Sucuri firewall block" };

  if (h["x-amzn-waf-action"] === "captcha" || h["x-amzn-waf-action"] === "challenge" || /awswaf.*challenge|AwsWafIntegration/i.test(html) && blockedStatus)
    return { vendor: "aws-waf", signal: "AWS WAF challenge" };

  // A page that is essentially only a CAPTCHA.
  const textish = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (
    blockedStatus &&
    textish.length < 1500 &&
    /(g-recaptcha|hcaptcha\.com\/1\/api\.js|h-captcha|challenges\.cloudflare\.com\/turnstile)/i.test(html) &&
    /captcha|verify you are (a )?human|are you a robot|security check/i.test(textish + " " + title)
  )
    return { vendor: "captcha", signal: "CAPTCHA-only page" };

  return null;
}
