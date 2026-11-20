/**
 * Button-text contrast fixer (SM-135).
 *
 * A follow-up like «gör knapparna mörkgröna» used to leave button labels
 * nearly invisible: the model darkened `--color-primary` (or invented a
 * `--color-cta`) but kept a dark foreground, or gave one button a background
 * class and a text class from two different token pairs. A prompt cannot hold
 * that on its own, so the merged project is measured instead.
 *
 * Two deterministic passes, both against WCAG 2 AA for normal text (4.5:1):
 *
 *  1. Theme pairs in `app/globals.css` `@theme`: every `--color-X` that has a
 *     `--color-X-foreground`, plus background/foreground. A failing literal
 *     foreground moves to the nearest readable lightness and keeps its hue.
 *     The brand color itself is never changed (same choice as the app's own
 *     SM-016 fix). `muted` is skipped: `muted-foreground` is secondary text on
 *     the page background, not a label on `bg-muted`.
 *  2. Filled buttons in TSX/JSX (`<Button>`, `<button>`, `<a>`, `<Link>` with an
 *     opaque `bg-*`): background and text class are resolved through the theme
 *     tokens. A failing text class is swapped for the matching `*-foreground`
 *     token (or another readable theme token, then white/black); a button that
 *     only inherits its text color gets the readable class added.
 *
 * Anything it cannot evaluate statically is left alone: translucent
 * backgrounds (the backdrop is unknown), gradients, Tailwind palette classes,
 * `var()`-indirected theme values, computed class lists and the shadcn
 * primitives under `components/ui/`.
 */

import ts from "typescript";
import type { CodeFile } from "@/lib/gen/parser";
import type { FixEntryDraft } from "../types";
import { scriptKindForFile } from "./import-binding-ast";
import {
  WCAG_AA_NORMAL_TEXT,
  compositeOver,
  contrastRatio,
  parseCssColor,
  readableForegroundFor,
  type RgbaColor,
} from "./color-contrast";

export const BUTTON_CONTRAST_FIXER_ID = "button-contrast-fixer";

const THEME_FILE_PATHS = ["app/globals.css", "src/app/globals.css"];
const SCANNED_FILE_RE = /\.(tsx|jsx)$/i;
const UI_PRIMITIVE_RE = /(?:^|\/)components\/ui\//;
const BUTTON_TAGS = new Set(["Button", "button", "a", "Link"]);
const BG_IMAGE_RE = /^bg-(?:gradient|linear|radial|conic|\[(?:url|linear|radial|conic))/;
const WHITE: RgbaColor = { r: 1, g: 1, b: 1, alpha: 1 };
const BLACK: RgbaColor = { r: 0, g: 0, b: 0, alpha: 1 };

/** Pairs where `-foreground` is not meant as text on the base color. */
const SKIPPED_TOKEN_PAIRS = new Set(["muted"]);

/**
 * The host's canonical `components/ui/button.tsx`, which every generated
 * project receives. `text: null` = inherited; `bg: null` = unfilled.
 */
const BUTTON_VARIANTS: Record<string, { bg: string | null; text: string | null }> = {
  default: { bg: "primary", text: "primary-foreground" },
  secondary: { bg: "secondary", text: "secondary-foreground" },
  destructive: { bg: "destructive", text: "white" },
  outline: { bg: "background", text: null },
  ghost: { bg: null, text: null },
  link: { bg: null, text: null },
};

interface Edit {
  start: number;
  end: number;
  text: string;
}

function applyEdits(source: string, edits: Edit[]): string {
  let out = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

const formatRatio = (ratio: number) => `${ratio.toFixed(2)}:1`;

// ---------------------------------------------------------------------------
// Theme tokens
// ---------------------------------------------------------------------------

interface Declaration {
  raw: string;
  start: number;
  end: number;
}

interface ThemeTokens {
  /** `--color-<name>` declarations inside `@theme` blocks, keyed by `<name>`. */
  declarations: Map<string, Declaration>;
  colors: Map<string, RgbaColor>;
  vars: Map<string, string>;
}

function findBlocks(css: string): Array<{ kind: "theme" | "root"; start: number; end: number }> {
  const blocks: Array<{ kind: "theme" | "root"; start: number; end: number }> = [];
  for (const match of css.matchAll(/(@theme\b[^{;]*|:root)\s*\{/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}" && --depth === 0) {
        blocks.push({ kind: match[1].startsWith("@theme") ? "theme" : "root", start: open + 1, end: i });
        break;
      }
    }
  }
  // `:root` first so `@theme` wins for a name declared in both.
  return blocks.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "root" ? -1 : 1));
}

function resolveVarValue(raw: string, vars: Map<string, string>, depth = 0): string {
  const match = raw.trim().match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (!match || depth > 5) return raw.trim();
  const target = vars.get(match[1]);
  if (target !== undefined) return resolveVarValue(target, vars, depth + 1);
  return match[2] ? resolveVarValue(match[2], vars, depth + 1) : raw.trim();
}

function readThemeTokens(css: string): ThemeTokens | null {
  // Comments become spaces so offsets still point into the original text.
  const masked = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
  const declarations = new Map<string, Declaration>();
  const vars = new Map<string, string>();
  for (const block of findBlocks(masked)) {
    const inner = masked.slice(block.start, block.end);
    for (const match of inner.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+?)\s*;/g)) {
      const [whole, name, raw] = match;
      vars.set(name, raw);
      if (block.kind !== "theme" || !name.startsWith("--color-")) continue;
      const start = block.start + (match.index ?? 0) + whole.indexOf(raw, name.length);
      declarations.set(name.slice("--color-".length), { raw, start, end: start + raw.length });
    }
  }
  const colors = new Map<string, RgbaColor>();
  for (const [name, declaration] of declarations) {
    const color = parseCssColor(resolveVarValue(declaration.raw, vars));
    if (color) colors.set(name, color);
  }
  return colors.size > 0 ? { declarations, colors, vars } : null;
}

function pageBackground(tokens: ThemeTokens): RgbaColor {
  const background = tokens.colors.get("background");
  return background ? compositeOver(background, WHITE) : WHITE;
}

function fixThemePairs(css: string, tokens: ThemeTokens, path: string, fixes: FixEntryDraft[]): string {
  const pairs: Array<[string, string]> = [["background", "foreground"]];
  for (const name of tokens.colors.keys()) {
    if (name.endsWith("-foreground") || SKIPPED_TOKEN_PAIRS.has(name)) continue;
    if (tokens.colors.has(`${name}-foreground`)) pairs.push([name, `${name}-foreground`]);
  }

  const edits: Edit[] = [];
  for (const [bgName, fgName] of pairs) {
    const bgColor = tokens.colors.get(bgName);
    const fgColor = tokens.colors.get(fgName);
    const declaration = tokens.declarations.get(fgName);
    if (!bgColor || !fgColor || !declaration) continue;
    const bg = compositeOver(bgColor, bgName === "background" ? WHITE : pageBackground(tokens));
    const before = contrastRatio(compositeOver(fgColor, bg), bg);
    if (before >= WCAG_AA_NORMAL_TEXT) continue;
    // A `var()` value is part of a light/dark switch this pass does not model.
    if (!parseCssColor(declaration.raw)) continue;
    const replacement = readableForegroundFor(bg, fgColor);
    const replacementColor = parseCssColor(replacement);
    if (!replacementColor) continue;
    edits.push({ start: declaration.start, end: declaration.end, text: replacement });
    tokens.colors.set(fgName, replacementColor);
    fixes.push({
      fixer: BUTTON_CONTRAST_FIXER_ID,
      category: "mechanical",
      description: `Raised --color-${fgName} on --color-${bgName} from ${formatRatio(before)} to ${formatRatio(contrastRatio(replacementColor, bg))} (WCAG AA)`,
      file: path,
      line: lineAt(css, declaration.start),
    });
  }
  return applyEdits(css, edits);
}

// ---------------------------------------------------------------------------
// Filled buttons in JSX
// ---------------------------------------------------------------------------

interface ResolvedColor {
  color: RgbaColor;
  token: string | null;
}

/** `primary`, `primary/90`, `white`, `[#1f3d2b]`, `[var(--color-cta)]`, `(--cta)`. */
function resolveColorClass(body: string, tokens: ThemeTokens): ResolvedColor | null {
  let value = body;
  let opacity = 1;
  const modifier = value.match(/^(.*[^/])\/(\d{1,3}|\[[\d.]+%?\])$/);
  if (modifier) {
    value = modifier[1];
    const raw = modifier[2];
    if (raw.startsWith("[")) {
      const inner = raw.slice(1, -1);
      opacity = inner.endsWith("%") ? Number(inner.slice(0, -1)) / 100 : Number(inner);
    } else {
      opacity = Number(raw) / 100;
    }
    if (!Number.isFinite(opacity)) return null;
  }

  let token: string | null = null;
  let cssValue = "";
  if (value.startsWith("[") && value.endsWith("]")) {
    cssValue = value.slice(1, -1).replace(/_/g, " ").replace(/^color:/, "");
  } else if (value.startsWith("(") && value.endsWith(")")) {
    cssValue = `var(${value.slice(1, -1)})`;
  } else if (tokens.colors.has(value)) {
    token = value;
  } else if (value === "white" || value === "black") {
    cssValue = value;
  } else {
    return null;
  }
  const themeVar = cssValue.match(/^var\(\s*--color-([\w-]+)\s*\)$/);
  if (themeVar && tokens.colors.has(themeVar[1])) token = themeVar[1];

  const base = token ? tokens.colors.get(token) : parseCssColor(resolveVarValue(cssValue, tokens.vars));
  if (!base) return null;
  return { color: { ...base, alpha: base.alpha * Math.min(1, Math.max(0, opacity)) }, token };
}

interface ClassToken {
  /** Class without a leading `!`. */
  value: string;
  start: number;
  end: number;
  important: boolean;
}

interface ClassList {
  tokens: ClassToken[];
  /** Where a missing text class is appended (end of the first literal). */
  appendAt: number | null;
  appendNeedsSpace: boolean;
}

function stringLiteralRange(node: ts.Node, sf: ts.SourceFile): { start: number; end: number } {
  return { start: node.getStart(sf) + 1, end: node.getEnd() - 1 };
}

/**
 * Static classes of a `className` attribute. `null` when the class list is
 * computed (template interpolation, `buttonVariants(...)`) and cannot be read.
 */
function readClassList(attr: ts.JsxAttribute | undefined, sf: ts.SourceFile): ClassList | null {
  const ranges: Array<{ start: number; end: number }> = [];
  const init = attr?.initializer;
  if (init && ts.isStringLiteral(init)) {
    ranges.push(stringLiteralRange(init, sf));
  } else if (init && ts.isJsxExpression(init) && init.expression) {
    let computed = false;
    const walk = (node: ts.Node) => {
      if (ts.isTemplateExpression(node)) computed = true;
      else if (ts.isCallExpression(node) && node.expression.getText(sf) === "buttonVariants") computed = true;
      else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        ranges.push(stringLiteralRange(node, sf));
      } else ts.forEachChild(node, walk);
    };
    walk(init.expression);
    if (computed) return null;
  } else if (init) {
    return null;
  }

  const source = sf.text;
  const tokens: ClassToken[] = [];
  for (const range of ranges) {
    for (const match of source.slice(range.start, range.end).matchAll(/\S+/g)) {
      const rawClass = match[0];
      if (rawClass.includes(":")) continue; // hover:, md:, dark: …
      const start = range.start + (match.index ?? 0);
      tokens.push({
        value: rawClass.replace(/^!/, ""),
        start,
        end: start + rawClass.length,
        important: rawClass.startsWith("!"),
      });
    }
  }
  const first = ranges[0];
  return {
    tokens,
    appendAt: first ? first.end : null,
    appendNeedsSpace: first ? source.slice(first.start, first.end).trim().length > 0 : false,
  };
}

function readButtonVariant(attr: ts.JsxAttribute | undefined): string | null {
  if (!attr) return "default";
  const init = attr.initializer;
  if (init && ts.isStringLiteral(init)) return init.text;
  if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) {
    return init.expression.text;
  }
  return null;
}

function pickReadableTextToken(bg: ResolvedColor, tokens: ThemeTokens): string {
  const candidates = [bg.token ? `${bg.token}-foreground` : null, "foreground", "background"];
  for (const name of candidates) {
    const color = name ? tokens.colors.get(name) : undefined;
    if (color && contrastRatio(compositeOver(color, bg.color), bg.color) >= WCAG_AA_NORMAL_TEXT) {
      return name!;
    }
  }
  return contrastRatio(WHITE, bg.color) >= contrastRatio(BLACK, bg.color) ? "white" : "black";
}

function fixButtonsInFile(file: CodeFile, tokens: ThemeTokens, fixes: FixEntryDraft[]): CodeFile {
  const source = file.content;
  if (!/<(?:Button|button|a|Link)[\s/>]/.test(source) || !/\bbg-|<Button\b/.test(source)) return file;
  const sf = ts.createSourceFile(file.path, source, ts.ScriptTarget.Latest, true, scriptKindForFile(file.path));
  const edits: Edit[] = [];

  const inspect = (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement) => {
    const tagName = node.tagName.getText(sf);
    if (!BUTTON_TAGS.has(tagName)) return;
    const attributes = new Map<string, ts.JsxAttribute>();
    for (const property of node.attributes.properties) {
      if (ts.isJsxAttribute(property)) attributes.set(property.name.getText(sf), property);
    }
    const classList = readClassList(attributes.get("className"), sf);
    if (!classList || classList.tokens.some((token) => BG_IMAGE_RE.test(token.value))) return;

    const pick = (prefix: "bg-" | "text-") => {
      const found = new Map<string, { token: ClassToken; resolved: ResolvedColor }>();
      for (const token of classList.tokens) {
        if (!token.value.startsWith(prefix)) continue;
        const resolved = resolveColorClass(token.value.slice(prefix.length), tokens);
        if (resolved && !found.has(token.value)) found.set(token.value, { token, resolved });
      }
      return found;
    };
    const bgClasses = pick("bg-");
    const textClasses = pick("text-");
    // Two backgrounds or two text colors = a conditional class list.
    if (bgClasses.size > 1 || textClasses.size > 1) return;
    const bgClass = [...bgClasses.values()][0];
    const textClass = [...textClasses.values()][0];

    let variantStyle: (typeof BUTTON_VARIANTS)[string] | undefined;
    if (tagName === "Button") {
      const variant = readButtonVariant(attributes.get("variant"));
      variantStyle = variant ? BUTTON_VARIANTS[variant] : undefined;
      if (!variantStyle && !bgClass) return; // computed or custom variant
    }

    const variantBg = variantStyle?.bg ? tokens.colors.get(variantStyle.bg) : undefined;
    const bg: ResolvedColor | null =
      bgClass?.resolved ?? (variantBg ? { color: variantBg, token: variantStyle!.bg } : null);
    // Unfilled, or translucent over a backdrop this pass cannot see.
    if (!bg || bg.color.alpha < 1) return;

    const inheritedText = tokens.colors.get("foreground");
    const text: ResolvedColor | null =
      textClass?.resolved ??
      (variantStyle?.text ? resolveColorClass(variantStyle.text, tokens) : null) ??
      (inheritedText ? { color: inheritedText, token: "foreground" } : null);
    if (!text) return;

    const before = contrastRatio(compositeOver(text.color, bg.color), bg.color);
    if (before >= WCAG_AA_NORMAL_TEXT) return;

    const choice = pickReadableTextToken(bg, tokens);
    const replacement = `text-${choice}`;
    if (textClass) {
      const { token } = textClass;
      edits.push({ start: token.start, end: token.end, text: `${token.important ? "!" : ""}${replacement}` });
    } else if (classList.appendAt !== null) {
      const at = classList.appendAt;
      edits.push({ start: at, end: at, text: classList.appendNeedsSpace ? ` ${replacement}` : replacement });
    } else {
      return;
    }
    const after = contrastRatio(resolveColorClass(choice, tokens)?.color ?? WHITE, bg.color);
    fixes.push({
      fixer: BUTTON_CONTRAST_FIXER_ID,
      category: "mechanical",
      description: `Readable <${tagName}> text: ${bgClass?.token.value ?? `bg-${bg.token}`} with ${textClass?.token.value ?? "inherited text"} was ${formatRatio(before)}, now ${replacement} at ${formatRatio(after)} (WCAG AA)`,
      file: file.path,
      line: lineAt(source, node.getStart(sf)),
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) inspect(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return edits.length > 0 ? { ...file, content: applyEdits(source, edits) } : file;
}

/**
 * Project-level pass over the merged files. Returns the input array untouched
 * (and no fixes) when every evaluated pair already meets WCAG AA.
 */
export function fixButtonContrast(files: CodeFile[]): { files: CodeFile[]; fixes: FixEntryDraft[] } {
  const themeFile = THEME_FILE_PATHS.map((path) => files.find((file) => file.path === path)).find(
    (file): file is CodeFile => Boolean(file),
  );
  if (!themeFile) return { files, fixes: [] };
  const tokens = readThemeTokens(themeFile.content);
  if (!tokens) return { files, fixes: [] };

  const fixes: FixEntryDraft[] = [];
  const nextCss = fixThemePairs(themeFile.content, tokens, themeFile.path, fixes);
  let changed = nextCss !== themeFile.content;
  const nextFiles = files.map((file) => {
    if (file === themeFile) return changed ? { ...file, content: nextCss } : file;
    if (!SCANNED_FILE_RE.test(file.path) || UI_PRIMITIVE_RE.test(file.path)) return file;
    const next = fixButtonsInFile(file, tokens, fixes);
    if (next !== file) changed = true;
    return next;
  });
  return changed ? { files: nextFiles, fixes } : { files, fixes: [] };
}
