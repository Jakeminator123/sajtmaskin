/**
 * Button-text contrast fixer (SM-135).
 *
 * A follow-up like «gör knapparna mörkgröna» could leave a label nearly
 * invisible: the model darkened `--color-primary` but kept a dark
 * `--color-primary-foreground`, or gave a button a background class and a text
 * class from two different token pairs.
 *
 * Rule: a fixer that guesses is worse than none. It changes a label only when
 * it knows, for certain, both the background and the text color of that
 * button, in every state it can be in. Everything else is left alone.
 *
 * Runs once per new version (first build and follow-ups) from
 * `finalize-preflight/runner.ts`, never at preview start or export.
 *
 *  1. Theme pairs in `app/globals.css` `@theme`: `--color-X` against
 *     `--color-X-foreground` (not `muted`, `card`, `popover`), both literal
 *     colors declared only in `@theme`. Below {@link BUTTON_TEXT_MIN_CONTRAST}
 *     the foreground moves to the nearest readable lightness and keeps its hue.
 *     The brand color itself is never changed (same choice as the app's own
 *     SM-016 fix). This edits a shared token: every `text-X-foreground` follows.
 *  2. Filled buttons in TSX/JSX (`<Button>` default/secondary, `<button>`, `<a>`,
 *     `<Link>`): only when every `bg-`/`text-` class resolves to a known opaque
 *     color, the class list is unconditional string literals, there is no
 *     `style`, spread, `asChild` or `dark:` color, and the text color is set on
 *     the element itself. A failing text class is swapped for the matching
 *     `*-foreground` token, another readable theme token, or white/black, but
 *     only if the new text is also readable in every `hover:`/`focus:`/…
 *     state that changes the background.
 *
 * A repair always lands at WCAG 2 AA for normal text (4.5:1).
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
  relativeLuminance,
  type RgbaColor,
} from "./color-contrast";

export const BUTTON_CONTRAST_FIXER_ID = "button-contrast-fixer";

/**
 * Below this a button label counts as unreadable and is repaired.
 *
 * 3:1, not WCAG AA's 4.5:1 for normal text, by orchestrator decision
 * 2026-11-20: the bug to fix is nearly invisible labels (SM-135, ~1.5:1).
 * Every scaffold default theme (4.10:1), 11 of 41 variants (3.19–4.39:1) and
 * 13 of 26 cluster palettes (3.95–4.48:1) are below 4.5 today, so a 4.5 gate
 * would restyle most new builds as a side effect. None is below 3. The goal is
 * {@link WCAG_AA_NORMAL_TEXT}: raise this once those palettes pass at the
 * source (SM-153). The "curated palettes" test fails until they do.
 */
export const BUTTON_TEXT_MIN_CONTRAST = 3;

const THEME_FILE_PATHS = ["app/globals.css", "src/app/globals.css"];
const SCANNED_FILE_RE = /\.(tsx|jsx)$/i;
const UI_PRIMITIVE_RE = /(?:^|\/)components\/ui\//;
const BUTTON_TAGS = new Set(["Button", "button", "a", "Link"]);
const CLASS_HELPERS = new Set(["cn", "clsx", "cx", "twMerge", "classNames"]);
const WHITE: RgbaColor = { r: 1, g: 1, b: 1, alpha: 1 };
const BLACK: RgbaColor = { r: 0, g: 0, b: 0, alpha: 1 };

/** Pairs whose `-foreground` is not a label on the base color. */
const SKIPPED_TOKEN_PAIRS = new Set(["muted", "card", "popover"]);

/** `bg-*` utilities that do not set a color. */
const BG_NON_COLOR_RE =
  /^bg-(?:(?:no-)?repeat(?:-x|-y|-round|-space)?|cover|contain|auto|fixed|local|scroll|center|top|bottom|left|right|(?:left|right)-(?:top|bottom)|(?:top|bottom)-(?:left|right)|clip-[\w-]+|origin-[\w-]+|blend-[\w-]+|size-\S+|position-\S+|\[(?:length|size|position|percentage):[^\]]+\])$/;
/** `bg-*` utilities that paint an image, or remove it: the color is not certain. */
const BG_IMAGE_RE = /^bg-(?:gradient|linear|radial|conic|none|\[(?:url|image:|linear-|radial-|conic-))/;
/** `text-*` utilities that do not set a color. */
const TEXT_NON_COLOR_RE =
  /^text-(?:(?:xs|sm|base|lg|xl|[2-9]xl)(?:\/\S+)?|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|\[(?:length:)?[\d.]+(?:px|rem|em|%|vw|vh|ch|pt)\]|\[(?:clamp|min|max|calc)\([^\]]*\)\])$/;

/**
 * The host's canonical `components/ui/button.tsx`, which every generated
 * project receives. Only variants whose fill and label are certain in every
 * mode; `outline` and `destructive` carry `dark:` backgrounds, `ghost` and
 * `link` are unfilled.
 */
const BUTTON_VARIANTS: Record<string, { bg: string; text: string; states: Record<string, string> }> = {
  default: { bg: "primary", text: "primary-foreground", states: { hover: "primary-hover" } },
  secondary: { bg: "secondary", text: "secondary-foreground", states: { hover: "secondary/80" } },
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
  /** Certain tokens only: a literal color declared in `@theme` and nowhere else. */
  colors: Map<string, RgbaColor>;
  declarations: Map<string, Declaration>;
  /** Every `--color-*` name declared anywhere in the file. */
  declared: Set<string>;
}

function findThemeBlocks(css: string): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  for (const match of css.matchAll(/@theme\b[^{;]*\{/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}" && --depth === 0) {
        blocks.push({ start: open + 1, end: i });
        break;
      }
    }
  }
  return blocks;
}

/**
 * Under `@theme inline` Tailwind copies the value into every utility, so a
 * redefinition elsewhere (`:root`, `.dark`, `@layer base`, a `button {}` rule)
 * does not reach `bg-*`; without `inline` it overrides at runtime. Either way
 * a name declared outside `@theme` is not certain, so it is not used.
 */
function readThemeTokens(css: string): ThemeTokens | null {
  const masked = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
  const blocks = findThemeBlocks(masked);
  const inTheme = (index: number) => blocks.some((block) => index > block.start && index < block.end);
  const declarations = new Map<string, Declaration>();
  const outside = new Set<string>();
  const declared = new Set<string>();
  for (const match of masked.matchAll(/(--color-[A-Za-z0-9_-]+)\s*:\s*([^;{}]+?)\s*(?=[;}])/g)) {
    const [whole, prop, raw] = match;
    const name = prop.slice("--color-".length);
    const index = match.index ?? 0;
    declared.add(name);
    if (!inTheme(index)) {
      outside.add(name);
      continue;
    }
    const start = index + whole.indexOf(raw, prop.length);
    declarations.set(name, { raw, start, end: start + raw.length });
  }
  const colors = new Map<string, RgbaColor>();
  for (const [name, declaration] of declarations) {
    if (outside.has(name)) continue;
    const color = parseCssColor(declaration.raw);
    if (color) colors.set(name, color);
  }
  return colors.size > 0 ? { colors, declarations, declared } : null;
}

function fixThemePairs(css: string, tokens: ThemeTokens, path: string, fixes: FixEntryDraft[]): string {
  const edits: Edit[] = [];
  for (const [bgName, bgColor] of [...tokens.colors]) {
    const fgName = `${bgName}-foreground`;
    const fgColor = tokens.colors.get(fgName);
    const declaration = tokens.declarations.get(fgName);
    if (bgName.endsWith("-foreground") || SKIPPED_TOKEN_PAIRS.has(bgName)) continue;
    if (!fgColor || !declaration || bgColor.alpha < 1) continue;
    const before = contrastRatio(compositeOver(fgColor, bgColor), bgColor);
    if (before >= BUTTON_TEXT_MIN_CONTRAST) continue;
    const replacement = readableForegroundFor(bgColor, fgColor);
    const replacementColor = parseCssColor(replacement);
    if (!replacementColor) continue;
    edits.push({ start: declaration.start, end: declaration.end, text: replacement });
    tokens.colors.set(fgName, replacementColor);
    fixes.push({
      fixer: BUTTON_CONTRAST_FIXER_ID,
      category: "mechanical",
      description: `Raised --color-${fgName} on --color-${bgName} from ${formatRatio(before)} to ${formatRatio(contrastRatio(replacementColor, bgColor))} (WCAG AA)`,
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

/** `primary`, `primary/90`, `white`, `[#1f3d2b]`, `[color:#fff]`, `[var(--color-cta)]`. */
function resolveColorValue(body: string, tokens: ThemeTokens): ResolvedColor | null {
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
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) return null;
  }

  let token: string | null = null;
  let base: RgbaColor | null | undefined = null;
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).replace(/_/g, " ").replace(/^color:/, "");
    const themeVar = inner.match(/^var\(\s*--color-([\w-]+)\s*\)$/);
    if (themeVar) {
      token = themeVar[1];
      base = tokens.colors.get(token);
    } else {
      base = parseCssColor(inner);
    }
  } else if (tokens.colors.has(value)) {
    token = value;
    base = tokens.colors.get(value);
  } else if (value === "white" || value === "black") {
    base = parseCssColor(value);
  }
  if (!base) return null;
  return { color: { ...base, alpha: base.alpha * opacity }, token };
}

interface ClassToken {
  prefix: string;
  utility: string;
  start: number;
  end: number;
  raw: string;
  literalEnd: number;
}

type Classified =
  | { kind: "ignore" }
  | { kind: "unsafe" }
  | { kind: "bg" | "text"; resolved: ResolvedColor };

/** Splits `md:hover:bg-x` at the last `:` outside brackets. */
function splitVariant(raw: string): { prefix: string; utility: string } {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "[" || ch === "(") depth += 1;
    else if (ch === "]" || ch === ")") depth -= 1;
    else if (ch === ":" && depth === 0) cut = i;
  }
  return cut < 0 ? { prefix: "", utility: raw } : { prefix: raw.slice(0, cut), utility: raw.slice(cut + 1) };
}

function classify(utility: string, tokens: ThemeTokens): Classified {
  if (utility.startsWith("[")) return { kind: "unsafe" };
  if (utility.startsWith("bg-")) {
    if (BG_IMAGE_RE.test(utility)) return { kind: "unsafe" };
    if (BG_NON_COLOR_RE.test(utility)) return { kind: "ignore" };
    const resolved = resolveColorValue(utility.slice(3), tokens);
    return resolved ? { kind: "bg", resolved } : { kind: "unsafe" };
  }
  if (utility.startsWith("text-")) {
    if (TEXT_NON_COLOR_RE.test(utility)) return { kind: "ignore" };
    const resolved = resolveColorValue(utility.slice(5), tokens);
    return resolved ? { kind: "text", resolved } : { kind: "unsafe" };
  }
  return { kind: "ignore" };
}

function literalRange(node: ts.Node, sf: ts.SourceFile): { start: number; end: number } {
  return { start: node.getStart(sf) + 1, end: node.getEnd() - 1 };
}

function isPlainString(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/**
 * The class list when it is certain: no `className`, a string, or
 * `cn(…)`/`clsx(…)` with only string arguments. Any condition, variable or
 * comparison makes it uncertain (`null`), so branches are never mixed and no
 * string inside logic is ever rewritten.
 */
function readClassTokens(attr: ts.JsxAttribute | undefined, sf: ts.SourceFile): ClassToken[] | null {
  const init = attr?.initializer;
  const ranges: Array<{ start: number; end: number }> = [];
  if (attr && !init) return null;
  if (init) {
    let expression: ts.Node = init;
    if (ts.isJsxExpression(init)) {
      if (!init.expression) return null;
      expression = init.expression;
      while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
    }
    if (isPlainString(expression)) {
      ranges.push(literalRange(expression, sf));
    } else if (
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      CLASS_HELPERS.has(expression.expression.text) &&
      expression.arguments.every(isPlainString)
    ) {
      for (const argument of expression.arguments) ranges.push(literalRange(argument, sf));
    } else {
      return null;
    }
  }

  const tokens: ClassToken[] = [];
  for (const range of ranges) {
    for (const match of sf.text.slice(range.start, range.end).matchAll(/\S+/g)) {
      const raw = match[0];
      const start = range.start + (match.index ?? 0);
      const { prefix, utility } = splitVariant(raw);
      tokens.push({
        prefix,
        utility: utility.replace(/^!|!$/g, ""),
        start,
        end: start + raw.length,
        raw,
        literalEnd: range.end,
      });
    }
  }
  return tokens;
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

/**
 * Readable on a state background? A translucent background lands between its
 * composite over black and over white; the label is safe only if both ends
 * pass and lie on the same side of it.
 */
function readableOn(text: RgbaColor, background: RgbaColor): boolean {
  if (background.alpha >= 1) return contrastRatio(text, background) >= WCAG_AA_NORMAL_TEXT;
  const overWhite = compositeOver(background, WHITE);
  const overBlack = compositeOver(background, BLACK);
  const textLum = relativeLuminance(text);
  const sameSide = relativeLuminance(overWhite) > textLum === relativeLuminance(overBlack) > textLum;
  return (
    sameSide &&
    contrastRatio(text, overWhite) >= WCAG_AA_NORMAL_TEXT &&
    contrastRatio(text, overBlack) >= WCAG_AA_NORMAL_TEXT
  );
}

interface ElementState {
  bg?: ResolvedColor;
  text?: ResolvedColor;
}

/** Background, text and state colors when all of them are certain, else `null`. */
function readButtonColors(
  tagName: string,
  attributes: Map<string, ts.JsxAttribute>,
  classTokens: ClassToken[],
  tokens: ThemeTokens,
): { bg: ResolvedColor; text: ResolvedColor; textClass: ClassToken | null; bgClass: ClassToken | null; states: Map<string, ElementState> } | null {
  let bg: ResolvedColor | null = null;
  let text: ResolvedColor | null = null;
  let bgClass: ClassToken | null = null;
  let textClass: ClassToken | null = null;
  const variantStates = new Map<string, ElementState>();
  const classStates = new Map<string, ElementState>();

  if (tagName === "Button") {
    const variant = readButtonVariant(attributes.get("variant"));
    const style = variant ? BUTTON_VARIANTS[variant] : undefined;
    if (!style) return null;
    const variantBg = tokens.colors.get(style.bg);
    const variantText = tokens.colors.get(style.text);
    if (variantBg) bg = { color: variantBg, token: style.bg };
    if (variantText) text = { color: variantText, token: style.text };
    for (const [prefix, value] of Object.entries(style.states)) {
      // A token the project never declares produces no utility at all.
      if (!tokens.declared.has(value.split("/")[0])) continue;
      const resolved = resolveColorValue(value, tokens);
      if (!resolved) return null;
      variantStates.set(prefix, { bg: resolved });
    }
  }

  for (const token of classTokens) {
    if (token.prefix === "" && /^opacity-(?!100$)|^mix-blend-/.test(token.utility)) return null;
    const classified = classify(token.utility, tokens);
    if (classified.kind === "ignore") continue;
    if (classified.kind === "unsafe") return null;
    if (token.prefix.split(":").includes("dark")) return null;
    if (token.prefix === "") {
      if (classified.kind === "bg") {
        if (bgClass) return null;
        bgClass = token;
        bg = classified.resolved;
      } else {
        if (textClass) return null;
        textClass = token;
        text = classified.resolved;
      }
      continue;
    }
    const state = classStates.get(token.prefix) ?? {};
    if (state[classified.kind]) return null;
    state[classified.kind] = classified.resolved;
    classStates.set(token.prefix, state);
  }

  // Inherited text or background, or a fill the backdrop shows through.
  if (!bg || !text || bg.color.alpha < 1) return null;
  if (tagName !== "Button" && !bgClass) return null;

  // `cn()` lets a className state replace the variant's state of the same kind.
  const states = new Map<string, ElementState>();
  for (const prefix of new Set([...variantStates.keys(), ...classStates.keys()])) {
    const fromClass = classStates.get(prefix) ?? {};
    const fromVariant = variantStates.get(prefix) ?? {};
    states.set(prefix, { bg: fromClass.bg ?? fromVariant.bg, text: fromClass.text ?? fromVariant.text });
  }
  return { bg, text, textClass, bgClass, states };
}

function pickReadableText(
  bg: ResolvedColor,
  states: Map<string, ElementState>,
  tokens: ThemeTokens,
): { name: string; color: RgbaColor } | null {
  const candidates = [bg.token ? `${bg.token}-foreground` : null, "foreground", "background", "white", "black"];
  for (const name of candidates) {
    if (!name) continue;
    const color = name === "white" ? WHITE : name === "black" ? BLACK : tokens.colors.get(name);
    if (!color || color.alpha < 1) continue;
    if (!readableOn(color, bg.color)) continue;
    const everyState = [...states.values()].every((state) => state.text || !state.bg || readableOn(color, state.bg.color));
    if (everyState) return { name, color };
  }
  return null;
}

function fixButtonsInFile(file: CodeFile, tokens: ThemeTokens, fixes: FixEntryDraft[]): CodeFile {
  const source = file.content;
  if (!/<(?:Button|button|a|Link)[\s/>]/.test(source) || !/\bbg-|<Button\b/.test(source)) return file;
  const sf = ts.createSourceFile(file.path, source, ts.ScriptTarget.Latest, true, scriptKindForFile(file.path));
  const edits: Edit[] = [];
  const slotChildren = new Set<ts.Node>();

  const attributesOf = (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement) => {
    const attributes = new Map<string, ts.JsxAttribute>();
    let spread = false;
    for (const property of node.attributes.properties) {
      if (ts.isJsxAttribute(property)) attributes.set(property.name.getText(sf), property);
      else spread = true;
    }
    return { attributes, spread };
  };

  const inspect = (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement) => {
    const tagName = node.tagName.getText(sf);
    if (!BUTTON_TAGS.has(tagName) || slotChildren.has(node)) return;
    const { attributes, spread } = attributesOf(node);
    if (spread || attributes.has("style") || attributes.has("asChild")) return;
    const classTokens = readClassTokens(attributes.get("className"), sf);
    if (!classTokens) return;
    const colors = readButtonColors(tagName, attributes, classTokens, tokens);
    if (!colors) return;
    const { bg, text, textClass, bgClass, states } = colors;

    const before = contrastRatio(compositeOver(text.color, bg.color), bg.color);
    if (before >= BUTTON_TEXT_MIN_CONTRAST) return;
    const choice = pickReadableText(bg, states, tokens);
    if (!choice) return;

    const replacement = `text-${choice.name}`;
    if (textClass) {
      const lead = textClass.raw.startsWith("!") ? "!" : "";
      const trail = !lead && textClass.raw.endsWith("!") ? "!" : "";
      edits.push({ start: textClass.start, end: textClass.end, text: `${lead}${replacement}${trail}` });
    } else {
      const anchor = bgClass ?? classTokens[classTokens.length - 1];
      // A default <Button> without classes is covered by the theme pass.
      if (!anchor) return;
      edits.push({ start: anchor.literalEnd, end: anchor.literalEnd, text: ` ${replacement}` });
    }
    fixes.push({
      fixer: BUTTON_CONTRAST_FIXER_ID,
      category: "mechanical",
      description: `Readable <${tagName}> text: ${bgClass?.raw ?? `bg-${bg.token}`} with ${textClass?.raw ?? `text-${text.token}`} was ${formatRatio(before)}, now ${replacement} at ${formatRatio(contrastRatio(choice.color, bg.color))} (WCAG AA)`,
      file: file.path,
      line: lineAt(source, node.getStart(sf)),
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) {
      const { attributes } = attributesOf(node.openingElement);
      if (attributes.has("asChild")) {
        // A Slot merges its classes into the child: neither side is certain alone.
        for (const child of node.children) {
          if (ts.isJsxElement(child)) slotChildren.add(child.openingElement);
          else if (ts.isJsxSelfClosingElement(child)) slotChildren.add(child);
        }
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) inspect(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return edits.length > 0 ? { ...file, content: applyEdits(source, edits) } : file;
}

/**
 * Project-level pass over a new version's merged files. Returns the input
 * array untouched (and no fixes) when nothing is certainly unreadable.
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

/** Receipt counts: theme tokens raised and individual buttons changed. */
export function countButtonContrastFixes(
  fixes: ReadonlyArray<{ fixer: string; file?: string }>,
): { tokens: number; buttons: number } {
  let tokens = 0;
  let buttons = 0;
  for (const fix of fixes) {
    if (fix.fixer !== BUTTON_CONTRAST_FIXER_ID) continue;
    if (fix.file && /\.css$/i.test(fix.file)) tokens += 1;
    else buttons += 1;
  }
  return { tokens, buttons };
}
