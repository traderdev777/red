import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { open, seal } from "./secretBox";

const key = randomBytes(32).toString("base64");

describe("secretBox", () => {
  it("round-trips and never contains the plaintext", () => {
    const s = seal("AIzaSyExample-not-a-real-key", key);
    expect(s).not.toContain("AIzaSy");
    expect(open(s, key)).toBe("AIzaSyExample-not-a-real-key");
  });
  it("fails on tampering or the wrong key", () => {
    const s = seal("secret", key);
    const parts = s.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => open(parts.join("."), key)).toThrow();
    expect(() => open(s, randomBytes(32).toString("base64"))).toThrow();
  });
  it("requires a 32-byte key", () => {
    expect(() => seal("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});
