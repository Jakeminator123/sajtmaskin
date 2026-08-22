/**
 * Låser BUG-SWARM-BACKLOG-raden om primärknappens AA-kontrast (M#a11y2):
 * "Appens primärknapp klarar inte WCAG 2 AA i liten text".
 *
 * Appen är dark-only (`:root` i globals.css ÄR mörka temat). Buttons default-
 * variant är `bg-primary text-primary-foreground` i text-sm, så paret
 * --primary / --primary-foreground måste hålla >= 4.5:1 (WCAG 2 SC 1.4.3,
 * normalstor text). Vit text på #337AFF gav 3.90:1; fixen bytte
 * --primary-foreground till bakgrundstonen 220 16% 7% (4.85:1) och lämnade
 * brand-blå --primary oförändrad (text-primary på mörk bakgrund i ~67 filer).
 *
 * Testet läser tokens direkt ur globals.css och räknar WCAG-ration
 * dependency-fritt (hsl -> sRGB -> relativ luminans), så en framtida
 * token-ändring som återinför felet blir röd här.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const GLOBALS_CSS_PATH = path.resolve(__dirname, "globals.css");
const SRC_PATH = path.resolve(__dirname, "..");
const TAILWIND_CONFIG_PATH = path.resolve(__dirname, "../../tailwind.config.cjs");

function listTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTsxFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
}

/** Plockar ut HSL-tripletten (grader, %, %) ur `--<name>: H S% L%;` i :root. */
function readHslToken(css: string, name: string): { h: number; s: number; l: number } {
  // (?<![\w-]) hindrar att t.ex. --sidebar-primary matchar för name="primary".
  const match = css.match(
    new RegExp(`(?<![\\w-])--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*;`),
  );
  if (!match) throw new Error(`Token --${name} hittades inte som HSL-triplett i globals.css`);
  return { h: Number(match[1]), s: Number(match[2]) / 100, l: Number(match[3]) / 100 };
}

/** CSS Color 3 HSL -> sRGB, kanaler i 0..1. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}

/** WCAG 2 relativ luminans av sRGB-kanaler i 0..1. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 kontrastration mellan två luminanser. */
function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Kompositerar en sRGB-overlay över en underliggande färg. */
function compositeOver(
  overlay: [number, number, number],
  underlay: [number, number, number],
  alpha: number,
): [number, number, number] {
  return underlay.map((channel, index) => overlay[index] * alpha + channel * (1 - alpha)) as [
    number,
    number,
    number,
  ];
}

describe("globals.css token-kontrast (WCAG 2 AA)", () => {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8");

  it("--primary-foreground på --primary håller >= 4.5:1 (Button default, text-sm)", () => {
    const primary = readHslToken(css, "primary");
    const primaryFg = readHslToken(css, "primary-foreground");
    const ratio = contrastRatio(
      relativeLuminance(hslToRgb(primary.h, primary.s, primary.l)),
      relativeLuminance(hslToRgb(primaryFg.h, primaryFg.s, primaryFg.l)),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("--primary-foreground på opak --primary-hover håller >= 4.5:1", () => {
    const primaryHover = readHslToken(css, "primary-hover");
    const primaryFg = readHslToken(css, "primary-foreground");
    const ratio = contrastRatio(
      relativeLuminance(hslToRgb(primaryHover.h, primaryHover.s, primaryHover.l)),
      relativeLuminance(hslToRgb(primaryFg.h, primaryFg.s, primaryFg.l)),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("hover-paret håller >= 4.5:1 även under btn-glows mörkaste overlay", () => {
    const primaryHover = readHslToken(css, "primary-hover");
    const primaryFg = readHslToken(css, "primary-foreground");
    const black: [number, number, number] = [0, 0, 0];
    const hoverUnderGlow = compositeOver(
      black,
      hslToRgb(primaryHover.h, primaryHover.s, primaryHover.l),
      0.1,
    );
    const foregroundUnderGlow = compositeOver(
      black,
      hslToRgb(primaryFg.h, primaryFg.s, primaryFg.l),
      0.1,
    );

    expect(
      contrastRatio(relativeLuminance(hoverUnderGlow), relativeLuminance(foregroundUnderGlow)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("produktens primära hover använder den opaka tokenen utan alfablending", () => {
    const config = readFileSync(TAILWIND_CONFIG_PATH, "utf8");
    expect(config).toContain('hover: "hsl(var(--primary-hover))"');

    const opacityHover = ["hover:bg-primary", "90"].join("/");
    const offenders = listTsxFiles(SRC_PATH).filter((file) =>
      readFileSync(file, "utf8").includes(opacityHover),
    );
    expect(offenders).toEqual([]);
  });

  it("brand-blå --primary är oförändrad (ägarbeslut: text-primary på mörk bakgrund i ~67 filer)", () => {
    const primary = readHslToken(css, "primary");
    expect(primary).toEqual({ h: 219, s: 1, l: 0.6 });
  });
});
