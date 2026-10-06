import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function tokenColor(token: string): string {
  const value = css.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1].trim();
  if (!value) throw new Error(`Missing color for ${token}`);
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  const alias = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  if (alias) return tokenColor(alias);
  throw new Error(`Unsupported color for ${token}: ${value}`);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const light = luminance(tokenColor(foreground));
  const dark = luminance(tokenColor(background));
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

describe("shared CSS colors", () => {
  it.each(
    ["--text", "--text-soft", "--muted", "--muted-soft", "--accent"].flatMap(
      (text) =>
        ["--page", "--surface", "--surface-muted"].map((surface) => [
          text,
          surface,
        ]),
    ),
  )("%s is readable on %s", (text, surface) => {
    expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["--danger", "--danger-wash"],
    ["--danger", "--surface"],
    ["--success", "--success-wash"],
    ["--success", "--page"],
    ["--on-dark", "--accent"],
    ["--accent", "--accent-wash"],
  ])("%s feedback/control text is readable on %s", (text, surface) => {
    expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["--page", "--surface", "--surface-muted"])(
    "the accent focus ring contrasts with %s",
    (surface) => {
      expect(contrast("--focus", surface)).toBeGreaterThanOrEqual(3);
    },
  );

  it("the light focus ring contrasts with the dark compare bar", () => {
    expect(contrast("--on-dark", "--text")).toBeGreaterThanOrEqual(3);
  });
});
