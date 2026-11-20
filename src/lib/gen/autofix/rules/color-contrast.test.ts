import { describe, expect, it } from "vitest";
import {
  compositeOver,
  contrastRatio,
  parseCssColor,
  type RgbaColor,
} from "./color-contrast";

const rgb255 = (color: RgbaColor | null) =>
  color ? [color.r, color.g, color.b].map((channel) => Math.round(channel * 255)) : null;
const parse = (value: string) => {
  const color = parseCssColor(value);
  if (!color) throw new Error(`unparsed ${value}`);
  return color;
};

describe("parseCssColor", () => {
  it("converts OKLCH with the reference matrices (sRGB primaries round-trip)", () => {
    expect(rgb255(parseCssColor("oklch(0.628 0.2577 29.23)"))).toEqual([255, 0, 0]);
    expect(rgb255(parseCssColor("oklch(0.5198 0.1769 142.5)"))).toEqual([0, 128, 0]);
    expect(rgb255(parseCssColor("oklch(0.452 0.3132 264.05)"))).toEqual([0, 0, 255]);
    expect(rgb255(parseCssColor("oklch(1 0 0)"))).toEqual([255, 255, 255]);
    expect(rgb255(parseCssColor("oklch(62.8% 0.2577 29.23deg / 50%)"))).toEqual([255, 0, 0]);
    expect(parseCssColor("oklch(62.8% 0.2577 29.23deg / 50%)")?.alpha).toBe(0.5);
  });

  it("reads hex, rgb() and hsl() in the forms generated CSS uses", () => {
    expect(rgb255(parseCssColor("#337AFF"))).toEqual([51, 122, 255]);
    expect(rgb255(parseCssColor("#fff"))).toEqual([255, 255, 255]);
    expect(parseCssColor("#ffffff80")?.alpha).toBeCloseTo(0.5, 2);
    expect(rgb255(parseCssColor("rgb(48,75,56)"))).toEqual([48, 75, 56]);
    expect(rgb255(parseCssColor("rgb(48 75 56 / 0.5)"))).toEqual([48, 75, 56]);
    expect(rgb255(parseCssColor("hsl(220 16% 7%)"))).toEqual([15, 17, 21]);
    expect(rgb255(parseCssColor("hsla(0, 0%, 100%, 1)"))).toEqual([255, 255, 255]);
  });

  it("returns null for values it cannot evaluate statically", () => {
    for (const value of [
      "var(--primary)",
      "color-mix(in oklab, var(--color-primary) 10%, white)",
      "transparent",
      "currentColor",
      "linear-gradient(red, blue)",
      "14px",
      "#12",
    ]) {
      expect(parseCssColor(value), value).toBeNull();
    }
  });
});

describe("contrastRatio", () => {
  it("matches WCAG endpoints and the app's SM-016 reference pair", () => {
    expect(contrastRatio(parse("white"), parse("black"))).toBeCloseTo(21, 5);
    // src/app/globals-token-contrast.test.ts: white on #337AFF was 3.90:1.
    expect(contrastRatio(parse("white"), parse("#337AFF"))).toBeCloseTo(3.9, 1);
  });

  it("composites translucent colors before measuring", () => {
    const halfWhite = compositeOver(parse("rgb(255 255 255 / 0.5)"), parse("black"));
    expect(rgb255(halfWhite)).toEqual([128, 128, 128]);
  });
});
