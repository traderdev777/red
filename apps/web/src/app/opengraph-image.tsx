import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { colorTokens } from "@/lib/tokens";

export const dynamic = "force-static";

export const runtime = "nodejs";
export const alt = "RED · Paste a link. See how it's built.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const hex = (name: string) => colorTokens.find((t) => t.name === name)!.hex;

// Pixel trail from the mark, in grid units.
const TRAIL: [number, number, string][] = [
  [2, 0, "red-500"],
  [1, 1, "red-500"],
  [2, 2, "red-500"],
  [0, 2, "chrome-500"],
  [1, 3, "red-500"],
  [0, 4, "chrome-500"],
];

export default async function OpenGraphImage() {
  const michroma = await readFile(join(process.cwd(), "src/fonts/michroma-latin-400-normal.woff"));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: hex("ink-950"),
        padding: 72,
        fontFamily: "Michroma",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div style={{ display: "flex", position: "relative", width: 72, height: 72 }}>
          {TRAIL.map(([x, y, c]) => (
            <div
              key={`${x}-${y}`}
              style={{
                position: "absolute",
                left: x * 16,
                top: y * 16,
                width: 12,
                height: 12,
                background: hex(c),
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            color: hex("chrome-100"),
            letterSpacing: "-0.02em",
          }}
        >
          R<span style={{ color: hex("red-500") }}>E</span>D
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            fontSize: 68,
            lineHeight: 1.05,
            color: hex("chrome-100"),
            letterSpacing: "-0.035em",
          }}
        >
          Paste a link.
        </div>
        <div
          style={{
            fontSize: 68,
            lineHeight: 1.05,
            color: hex("chrome-300"),
            letterSpacing: "-0.035em",
          }}
        >
          See how it&rsquo;s built.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: `1px solid ${hex("line")}`,
          paddingTop: 24,
          fontSize: 18,
          color: hex("chrome-500"),
        }}
      >
        <span>Detected vs inferred, with evidence</span>
        <span>Public evidence only</span>
      </div>
    </div>,
    { ...size, fonts: [{ name: "Michroma", data: michroma, weight: 400, style: "normal" }] },
  );
}
