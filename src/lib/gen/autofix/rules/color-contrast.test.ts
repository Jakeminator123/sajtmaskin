import { describe, expect, it } from "vitest";
import {
  WCAG_AA_NORMAL_TEXT,
  compositeOver,
  contrastRatio,
  parseCssColor,
  readableForegroundFor,
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

describe("readableForegroundFor", () => {
  const ratio = (bg: string, fg: string) => contrastRatio(parse(bg), parse(fg));

  it("lifts dark text on a dark button to a light label (SM-135 «mörkgröna»)", () => {
    const bg = "oklch(0.35 0.07 150)";
    expect(ratio(bg, "oklch(0.22 0.03 60)")).toBeLessThan(2);
    const fixed = readableForegroundFor(parse(bg), parse("oklch(0.22 0.03 60)"));
    expect(ratio(bg, fixed)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(parse(fixed).r).toBeGreaterThan(0.9);
  });

  it("keeps light text light, with the smallest step, when that side can pass", () => {
    const bg = "oklch(0.45 0.12 25)";
    const fg = "oklch(0.8 0.05 80)";
    const fixed = readableForegroundFor(parse(bg), parse(fg));
    const fixedRatio = ratio(bg, fixed);
    expect(fixedRatio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(fixedRatio).toBeLessThan(5);
    expect(fixed).toMatch(/^oklch\(0\.\d+ [\d.]+ 80\)$/);
  });

  it("flips white text to dark when white can never pass (mid-tone brand color)", () => {
    // warm-local variant primary: white text is 3.19:1.
    const bg = "oklch(0.66 0.16 52)";
    const fixed = readableForegroundFor(parse(bg), parse("oklch(0.99 0 0)"));
    expect(ratio(bg, fixed)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(parse(fixed).r).toBeLessThan(0.3);
  });

  it("gives a near-invisible label a clear color, not a borderline grey", () => {
    const fixed = readableForegroundFor(parse("white"), parse("oklch(0.98 0 0)"));
    expect(ratio("white", fixed)).toBeGreaterThan(10);
  });
});
