/**
 * AES-256-GCM for small secrets (a user's Gemini key). Node only.
 * Format: "v1.<iv b64url>.<tag b64url>.<ciphertext b64url>". The key is a
 * 32-byte value, base64-encoded, from RED_SECRETS_KEY.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyFrom(b64: string | undefined): Buffer {
  if (!b64) throw new Error("RED_SECRETS_KEY is not set");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("RED_SECRETS_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function seal(plain: string, keyB64 = process.env.RED_SECRETS_KEY): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFrom(keyB64), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function open(sealed: string, keyB64 = process.env.RED_SECRETS_KEY): string {
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("unrecognized sealed secret");
  const d = createDecipheriv("aes-256-gcm", keyFrom(keyB64), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
