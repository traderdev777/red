import { CookieSchema, type Cookie } from "@red/shared";
import { isThirdParty } from "@red/shared/third-parties";
import { isoUtc } from "./util";

export interface RawCookie {
  name: string;
  value?: string; // present on input; never copied
  domain: string;
  path: string;
  expires: number; // -1 = session (Playwright)
  httpOnly: boolean;
  secure: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export function buildCookies(raw: RawCookie[], siteHost: string): Cookie[] {
  return raw.slice(0, 200).map((c) =>
    CookieSchema.parse({
      name: c.name.slice(0, 256),
      domain: c.domain.slice(0, 256),
      path: c.path.slice(0, 512),
      expires: c.expires > 0 ? isoUtc(c.expires * 1000) : null,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite ?? null,
      thirdParty: isThirdParty(c.domain.replace(/^\./, ""), siteHost),
    }),
  );
}
