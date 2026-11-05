import { DocumentHeadersSchema, SECURITY_HEADERS, type DocumentHeaders, type SecurityHeader } from "@red/shared";

/**
 * Set-Cookie is the one header that carries secrets. Keep the cookie name and
 * attributes, drop the value: "sid=abc; Path=/; HttpOnly" -> "sid=[redacted]; Path=/; HttpOnly".
 */
export function redactSetCookie(v: string): string {
  return v
    .split(/\n/)
    .map((line) => {
      const [first = "", ...attrs] = line.split(";");
      const eq = first.indexOf("=");
      const name = (eq === -1 ? first : first.slice(0, eq)).trim();
      return [`${name}=[redacted]`, ...attrs.map((a) => a.trim()).filter(Boolean)].join("; ");
    })
    .join("\n");
}

export function buildDocumentHeaders(headers: { name: string; value: string }[]): DocumentHeaders {
  const out = headers.map(({ name, value }) => {
    const n = name.toLowerCase();
    const v = n === "set-cookie" ? redactSetCookie(value) : value;
    return { name: n, value: v.length > 8192 ? v.slice(0, 8192) : v };
  });
  const present = new Set(out.map((h) => h.name));
  const security = Object.fromEntries(SECURITY_HEADERS.map((h) => [h, present.has(h)])) as Record<SecurityHeader, boolean>;
  return DocumentHeadersSchema.parse({ headers: out, security });
}
