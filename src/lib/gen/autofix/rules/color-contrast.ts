/**
 * Dependency-free CSS color parsing and WCAG 2 contrast math for generated
 * sites. Same formulas as the app's own token test
 * (`src/app/globals-token-contrast.test.ts`, SM-016), plus the color syntaxes
 * generated `app/globals.css` files actually use: `oklch()` (scaffold default),
 * hex, `rgb()` and `hsl()`.
 *
 * Colors are gamma-encoded sRGB channels in 0..1 plus alpha. Out-of-gamut
 * OKLCH values are clipped per channel, which is what a browser shows on an
 * sRGB screen closely enough for a contrast threshold.
 */

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

/** WCAG 2 AA for normal-size text. Button labels are treated as normal text. */
export const WCAG_AA_NORMAL_TEXT = 4.5;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function srgbEncode(linear: number): number {
  const c = clamp01(linear);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function srgbDecode(encoded: number): number {
  return encoded <= 0.04045 ? encoded / 12.92 : Math.pow((encoded + 0.055) / 1.055, 2.4);
}

function parseNumber(raw: string): number | null {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** `50%` → 0.5 when `percentScale` is 1; plain numbers pass through. */
function parseComponent(raw: string, percentScale: number): number | null {
  const trimmed = raw.trim();
  if (trimmed === "none") return 0;
  if (trimmed.endsWith("%")) {
    const value = parseNumber(trimmed.slice(0, -1));
    return value === null ? null : (value / 100) * percentScale;
  }
  return parseNumber(trimmed);
}

function parseHue(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "none") return 0;
  if (trimmed.endsWith("deg")) return parseNumber(trimmed.slice(0, -3));
  if (trimmed.endsWith("turn")) {
    const value = parseNumber(trimmed.slice(0, -4));
    return value === null ? null : value * 360;
  }
  if (trimmed.endsWith("rad")) {
    const value = parseNumber(trimmed.slice(0, -3));
    return value === null ? null : (value * 180) / Math.PI;
  }
  return parseNumber(trimmed);
}

function parseAlpha(raw: string | undefined): number | null {
  if (raw === undefined) return 1;
  const value = parseComponent(raw, 1);
  return value === null ? null : clamp01(value);
}

/**
 * Splits `a b c / d` or `a, b, c, d` into color components plus optional
 * alpha. Returns null for anything else (e.g. nested functions).
 */
function splitFunctionArgs(inner: string): { parts: string[]; alpha?: string } | null {
  if (/[()]/.test(inner)) return null;
  const [main, alpha, extra] = inner.split("/");
  if (extra !== undefined) return null;
  const parts = main
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (alpha !== undefined) return { parts, alpha: alpha.trim() };
  if (parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] };
  return { parts };
}

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

/** OKLCH → gamma-encoded sRGB (Björn Ottosson's reference matrices). */
function oklchToRgb(lightness: number, chroma: number, hueDeg: number): [number, number, number] {
  const hue = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    srgbEncode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    srgbEncode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    srgbEncode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function parseHex(hex: string): RgbaColor | null {
  const digits = hex.slice(1);
  if (!/^[0-9a-f]+$/i.test(digits)) return null;
  const expand = (value: string) => (value.length === 1 ? value + value : value);
  let channels: string[];
  if (digits.length === 3 || digits.length === 4) channels = digits.split("").map(expand);
  else if (digits.length === 6 || digits.length === 8) channels = digits.match(/../g) ?? [];
  else return null;
  const [r, g, b, a] = channels.map((channel) => parseInt(channel, 16) / 255);
  return { r, g, b, alpha: a ?? 1 };
}

/**
 * Parses a single CSS color value. Returns null for anything it cannot
 * evaluate statically (`var()`, `color-mix()`, gradients, `currentColor`,
 * `transparent`), so callers skip instead of guessing.
 */
export function parseCssColor(raw: string): RgbaColor | null {
  const value = raw.trim().toLowerCase().replace(/\s*!important$/, "");
  if (value === "white") return { r: 1, g: 1, b: 1, alpha: 1 };
  if (value === "black") return { r: 0, g: 0, b: 0, alpha: 1 };
  if (value.startsWith("#")) return parseHex(value);

  const fn = value.match(/^(rgba?|hsla?|oklch)\((.*)\)$/);
  if (!fn) return null;
  const args = splitFunctionArgs(fn[2]);
  if (!args || args.parts.length !== 3) return null;
  const alpha = parseAlpha(args.alpha);
  if (alpha === null) return null;

  if (fn[1] === "rgb" || fn[1] === "rgba") {
    const channels = args.parts.map((part) => parseComponent(part, 255));
    if (channels.some((channel) => channel === null)) return null;
    const [r, g, b] = (channels as number[]).map((channel) => clamp01(channel / 255));
    return { r, g, b, alpha };
  }

  if (fn[1] === "hsl" || fn[1] === "hsla") {
    const h = parseHue(args.parts[0]);
    const s = parseComponent(args.parts[1], 1);
    const l = parseComponent(args.parts[2], 1);
    if (h === null || s === null || l === null) return null;
    // Legacy comma syntax requires %, but `hsl(220 16% 7%)` and bare numbers
    // (`hsl(220 16 7)`, a percent scale) both occur in generated CSS.
    const sat = args.parts[1].trim().endsWith("%") ? s : s / 100;
    const light = args.parts[2].trim().endsWith("%") ? l : l / 100;
    const [r, g, b] = hslToRgb(h, clamp01(sat), clamp01(light));
    return { r, g, b, alpha };
  }

  const lightness = parseComponent(args.parts[0], 1);
  const chroma = parseComponent(args.parts[1], 0.4);
  const hue = parseHue(args.parts[2]);
  if (lightness === null || chroma === null || hue === null) return null;
  const [r, g, b] = oklchToRgb(clamp01(lightness), Math.max(0, chroma), hue);
  return { r, g, b, alpha };
}

/** Source-over compositing of a (possibly translucent) color on an opaque one. */
export function compositeOver(top: RgbaColor, bottom: RgbaColor): RgbaColor {
  const a = top.alpha;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    alpha: 1,
  };
}

/** WCAG 2 relative luminance of an opaque color. */
export function relativeLuminance(color: RgbaColor): number {
  return (
    0.2126 * srgbDecode(color.r) + 0.7152 * srgbDecode(color.g) + 0.0722 * srgbDecode(color.b)
  );
}

/** WCAG 2 contrast ratio (1..21) between two opaque colors. */
export function contrastRatio(a: RgbaColor, b: RgbaColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Gamma-encoded sRGB → OKLCH (inverse of {@link oklchToRgb}). */
function rgbToOklch(color: RgbaColor): Oklch {
  const r = srgbDecode(color.r);
  const g = srgbDecode(color.g);
  const b = srgbDecode(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.sqrt(a * a + bb * bb);
  const hue = chroma < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { l: lightness, c: chroma, h: hue };
}

function formatOklch({ l, c, h }: Oklch): string {
  const round = (value: number, digits: number) => Number(value.toFixed(digits));
  return `oklch(${round(clamp01(l), 3)} ${round(Math.max(0, c), 3)} ${round(h, 1)})`;
}

const WHITE: RgbaColor = { r: 1, g: 1, b: 1, alpha: 1 };
const BLACK: RgbaColor = { r: 0, g: 0, b: 0, alpha: 1 };

/**
 * A foreground that is readable on `background`, as close to `foreground` as
 * that allows.
 *
 * When the foreground's own side of the background can reach the target
 * (white text on a dark-enough button), it takes the smallest lightness step
 * there and keeps its hue, so a warm off-white stays a warm off-white. When
 * that side cannot (white on a mid-tone, dark on dark), it flips to a near
 * black or near white with a trace of the old hue, as the app's own SM-016 fix
 * did for its brand button. The output parses back to at least `minimum`.
 */
export function readableForegroundFor(
  background: RgbaColor,
  foreground: RgbaColor,
  minimum: number = WCAG_AA_NORMAL_TEXT,
): string {
  // A margin above the gate keeps the rounded output safely past it.
  const target = minimum + 0.1;
  const bg = compositeOver(background, WHITE);
  const fgOpaque = compositeOver(foreground, bg);
  const fg = rgbToOklch(fgOpaque);
  const preferred = relativeLuminance(fgOpaque) >= relativeLuminance(bg) ? "up" : "down";
  const reach = { up: contrastRatio(WHITE, bg), down: contrastRatio(BLACK, bg) };
  const passes = (candidate: Oklch) => {
    const parsed = parseCssColor(formatOklch(candidate));
    return parsed !== null && contrastRatio(parsed, bg) >= target;
  };

  // Text that nearly vanishes into its background has no "own side" worth
  // keeping; give it a clear label on whichever side reads best.
  const nearlyInvisible = contrastRatio(fgOpaque, bg) < 2;
  if (!nearlyInvisible && reach[preferred] >= target) {
    const extreme = preferred === "up" ? 1 : 0;
    const at = (t: number): Oklch => ({ l: fg.l + (extreme - fg.l) * t, c: fg.c * (1 - t), h: fg.h });
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (passes(at(mid))) hi = mid;
      else lo = mid;
    }
    if (passes(at(hi))) return formatOklch(at(hi));
  } else {
    const up = nearlyInvisible ? reach.up >= reach.down : preferred === "down";
    const strong: Oklch = { l: up ? 0.985 : 0.145, c: Math.min(fg.c, 0.02), h: fg.h };
    if (passes(strong)) return formatOklch(strong);
  }
  return reach.up >= reach.down ? "oklch(1 0 0)" : "oklch(0 0 0)";
}
