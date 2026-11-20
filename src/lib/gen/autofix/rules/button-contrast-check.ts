/**
 * Button-text contrast check (SM-135). Advisory: it reports, it never edits.
 *
 * A follow-up like «gör knapparna mörkgröna» could leave a label nearly
 * invisible: the model darkened `--color-primary` but kept a dark
 * `--color-primary-foreground`, or gave a button a background class and a text
 * class from two different token pairs.
 *
 * Four rounds of an automatic repair (#1757, #1764, #1770) each broke a case
 * it had not seen: a hover fill, a badge sharing the token, a self-made
 * `Button`. The rig showed the real failure was a color change that never took
 * effect, which the prompt contract now carries. So this check only measures
 * and the finalize runner records the result in version telemetry
 * (`generation_telemetry.meta.buttonContrast`). Automatic repair comes back
 * only if that telemetry shows the failure in real builds (SM-135).
 *
 * A button is reported only when its colors are certain: every `bg-`/`text-`
 * class resolves to a known opaque color (theme tokens: literal, declared only
 * in `@theme`), the class list is unconditional string literals, there is no
 * `style`, spread, `asChild` or `dark:` color, the text color is set on the
 * element or by its Button variant, and `<Button>` is the shadcn component
 * imported from `components/ui/button` and not redefined in the file.
 */

import path from "node:path";
import ts from "typescript";
import type { CodeFile } from "@/lib/gen/parser";
import { scriptKindForFile } from "./import-binding-ast";
import { compositeOver, contrastRatio, parseCssColor, type RgbaColor } from "./color-contrast";

/**
 * Below this a button label counts as nearly invisible and is reported.
 *
 * 3:1, not WCAG AA's 4.5:1 for normal text (`WCAG_AA_NORMAL_TEXT`), by
 * orchestrator decision 2026-11-20: every scaffold default theme (4.10:1),
 * 11 of 41 variants (3.19–4.39:1) and 13 of 26 cluster palettes
 * (3.95–4.48:1) are below 4.5 today, none below 3. The goal is 4.5 once those
 * palettes pass at the source (SM-153).
 */
export const BUTTON_TEXT_MIN_CONTRAST = 3;

export interface ButtonContrastFinding {
  file: string;
  line: number;
  tag: string;
  /** The background class, or the Button variant that sets it. */
  background: string;
  /** The text class, or the Button variant that sets it. */
  text: string;
  /** WCAG contrast ratio, two decimals. */
  ratio: number;
}

const THEME_FILE_PATHS = ["app/globals.css", "src/app/globals.css"];
const SCANNED_FILE_RE = /\.(tsx|jsx)$/i;
const UI_PRIMITIVE_RE = /(?:^|\/)components\/ui\//;
const BUTTON_TAGS = new Set(["Button", "button", "a", "Link"]);
const SHADCN_BUTTON_PATHS = new Set(["components/ui/button", "src/components/ui/button"]);
const CLASS_HELPERS = new Set(["cn", "clsx", "cx", "twMerge", "classNames"]);

/** `bg-*` utilities that do not set a color. */
const BG_NON_COLOR_RE =
  /^bg-(?:(?:no-)?repeat(?:-x|-y|-round|-space)?|cover|contain|auto|fixed|local|scroll|center|top|bottom|left|right|(?:left|right)-(?:top|bottom)|(?:top|bottom)-(?:left|right)|clip-[\w-]+|origin-[\w-]+|blend-[\w-]+|size-\S+|position-\S+|\[(?:length|size|position|percentage):[^\]]+\])$/;
/** `bg-*` utilities that paint an image, or remove it: the color is not certain. */
const BG_IMAGE_RE = /^bg-(?:gradient|linear|radial|conic|none|\[(?:url|image:|linear-|radial-|conic-))/;
/** `text-*` utilities that do not set a color. */
const TEXT_NON_COLOR_RE =
  /^text-(?:(?:xs|sm|base|lg|xl|[2-9]xl)(?:\/\S+)?|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|\[(?:length:)?[\d.]+(?:px|rem|em|%|vw|vh|ch|pt)\]|\[(?:clamp|min|max|calc)\([^\]]*\)\])$/;

/**
 * The host's canonical `components/ui/button.tsx`. Only variants whose fill
 * and label are certain in every mode; `outline` and `destructive` carry
 * `dark:` backgrounds, `ghost` and `link` are unfilled.
 */
const BUTTON_VARIANTS: Record<string, { bg: string; text: string }> = {
  default: { bg: "primary", text: "primary-foreground" },
  secondary: { bg: "secondary", text: "secondary-foreground" },
};

// ---------------------------------------------------------------------------
// Theme tokens
// ---------------------------------------------------------------------------

interface ThemeTokens {
  /** Certain tokens only: a literal color declared in `@theme` and nowhere else. */
  colors: Map<string, RgbaColor>;
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
  const values = new Map<string, string>();
  const outside = new Set<string>();
  for (const match of masked.matchAll(/(--color-[A-Za-z0-9_-]+)\s*:\s*([^;{}]+?)\s*(?=[;}])/g)) {
    const [, prop, raw] = match;
    const name = prop.slice("--color-".length);
    if (inTheme(match.index ?? 0)) values.set(name, raw);
    else outside.add(name);
  }
  const colors = new Map<string, RgbaColor>();
  for (const [name, raw] of values) {
    if (outside.has(name)) continue;
    const color = parseCssColor(raw);
    if (color) colors.set(name, color);
  }
  return colors.size > 0 ? { colors } : null;
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

/** `primary`, `primary/90`, `white`, `[#1f3d2b]`, `[color:#fff]`, `[var(--color-cta)]`. */
function resolveColorValue(body: string, tokens: ThemeTokens): RgbaColor | null {
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

  let base: RgbaColor | null | undefined = null;
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).replace(/_/g, " ").replace(/^color:/, "");
    const themeVar = inner.match(/^var\(\s*--color-([\w-]+)\s*\)$/);
    base = themeVar ? tokens.colors.get(themeVar[1]) : parseCssColor(inner);
  } else if (tokens.colors.has(value)) {
    base = tokens.colors.get(value);
  } else if (value === "white" || value === "black") {
    base = parseCssColor(value);
  }
  return base ? { ...base, alpha: base.alpha * opacity } : null;
}

type Classified = { kind: "ignore" } | { kind: "unsafe" } | { kind: "bg" | "text"; color: RgbaColor };

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
    const color = resolveColorValue(utility.slice(3), tokens);
    return color ? { kind: "bg", color } : { kind: "unsafe" };
  }
  if (utility.startsWith("text-")) {
    if (TEXT_NON_COLOR_RE.test(utility)) return { kind: "ignore" };
    const color = resolveColorValue(utility.slice(5), tokens);
    return color ? { kind: "text", color } : { kind: "unsafe" };
  }
  return { kind: "ignore" };
}

function isPlainString(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/**
 * The classes when they are certain: no `className`, a string, or
 * `cn(…)`/`clsx(…)` with only string arguments. Any condition, variable or
 * comparison makes them uncertain (`null`).
 */
function readClasses(attr: ts.JsxAttribute | undefined): Array<{ prefix: string; utility: string; raw: string }> | null {
  const init = attr?.initializer;
  const strings: string[] = [];
  if (attr && !init) return null;
  if (init) {
    let expression: ts.Node = init;
    if (ts.isJsxExpression(init)) {
      if (!init.expression) return null;
      expression = init.expression;
      while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
    }
    if (isPlainString(expression)) {
      strings.push(expression.text);
    } else if (
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      CLASS_HELPERS.has(expression.expression.text) &&
      expression.arguments.every(isPlainString)
    ) {
      for (const argument of expression.arguments) strings.push((argument as ts.StringLiteral).text);
    } else {
      return null;
    }
  }
  return strings.flatMap((text) =>
    text
      .split(/\s+/)
      .filter(Boolean)
      .map((raw) => {
        const { prefix, utility } = splitVariant(raw);
        return { prefix, utility: utility.replace(/^!|!$/g, ""), raw };
      }),
  );
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
 * `<Button>` is the shadcn component only when the file imports `Button` by
 * that name from `components/ui/button` and declares nothing else called
 * `Button` (R2-1770: a self-made `Button` with its own colors).
 */
function usesShadcnButton(sf: ts.SourceFile, filePath: string): boolean {
  let imported = false;
  let other = false;
  const resolves = (specifier: string) => {
    if (specifier.startsWith("@/")) return SHADCN_BUTTON_PATHS.has(specifier.slice(2));
    if (!specifier.startsWith(".")) return false;
    return SHADCN_BUTTON_PATHS.has(path.posix.join(path.posix.dirname(filePath), specifier));
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const fromShadcn = resolves(node.moduleSpecifier.text);
      if (clause?.name?.text === "Button") other = true;
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === "Button") other = true;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (element.name.text !== "Button") continue;
          const sameName = (element.propertyName ?? element.name).text === "Button";
          if (fromShadcn && sameName && !clause?.isTypeOnly && !element.isTypeOnly) imported = true;
          else other = true;
        }
      }
      return;
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === "Button"
    ) {
      other = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return imported && !other;
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

function checkFile(file: CodeFile, tokens: ThemeTokens): ButtonContrastFinding[] {
  const source = file.content;
  if (!/<(?:Button|button|a|Link)[\s/>]/.test(source) || !/\bbg-|<Button\b/.test(source)) return [];
  const sf = ts.createSourceFile(file.path, source, ts.ScriptTarget.Latest, true, scriptKindForFile(file.path));
  const shadcnButton = usesShadcnButton(sf, file.path);
  const findings: ButtonContrastFinding[] = [];
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
    const tag = node.tagName.getText(sf);
    if (!BUTTON_TAGS.has(tag) || slotChildren.has(node)) return;
    if (tag === "Button" && !shadcnButton) return;
    const { attributes, spread } = attributesOf(node);
    if (spread || attributes.has("style") || attributes.has("asChild")) return;
    const classes = readClasses(attributes.get("className"));
    if (!classes) return;

    let bg: RgbaColor | null = null;
    let text: RgbaColor | null = null;
    let bgLabel = "";
    let textLabel = "";
    if (tag === "Button") {
      const variant = readButtonVariant(attributes.get("variant"));
      const style = variant ? BUTTON_VARIANTS[variant] : undefined;
      if (!style) return;
      bg = tokens.colors.get(style.bg) ?? null;
      text = tokens.colors.get(style.text) ?? null;
      bgLabel = `variant ${variant} (bg-${style.bg})`;
      textLabel = `variant ${variant} (text-${style.text})`;
    }

    let bgClass = false;
    let textClass = false;
    for (const { prefix, utility, raw } of classes) {
      if (prefix === "" && /^opacity-(?!100$)|^mix-blend-/.test(utility)) return;
      const classified = classify(utility, tokens);
      if (classified.kind === "ignore") continue;
      if (classified.kind === "unsafe") return;
      if (prefix !== "") {
        // A state does not change the resting label; a dark mode might.
        if (prefix.split(":").includes("dark")) return;
        continue;
      }
      if (classified.kind === "bg") {
        if (bgClass) return;
        bgClass = true;
        bg = classified.color;
        bgLabel = raw;
      } else {
        if (textClass) return;
        textClass = true;
        text = classified.color;
        textLabel = raw;
      }
    }

    // Inherited text or background, or a fill the backdrop shows through.
    if (!bg || !text || bg.alpha < 1) return;
    if (tag !== "Button" && !bgClass) return;
    const ratio = contrastRatio(compositeOver(text, bg), bg);
    if (ratio >= BUTTON_TEXT_MIN_CONTRAST) return;
    findings.push({
      file: file.path,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      tag,
      background: bgLabel,
      text: textLabel,
      ratio: Math.round(ratio * 100) / 100,
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && attributesOf(node.openingElement).attributes.has("asChild")) {
      // A Slot merges its classes into the child: neither side is certain alone.
      for (const child of node.children) {
        if (ts.isJsxElement(child)) slotChildren.add(child.openingElement);
        else if (ts.isJsxSelfClosingElement(child)) slotChildren.add(child);
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) inspect(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/**
 * Buttons whose resting label is certainly below
 * {@link BUTTON_TEXT_MIN_CONTRAST}. Pure: reads the files, changes nothing.
 */
export function findUnreadableButtons(files: ReadonlyArray<CodeFile>): ButtonContrastFinding[] {
  const themeFile = THEME_FILE_PATHS.map((themePath) => files.find((file) => file.path === themePath)).find(
    (file): file is CodeFile => Boolean(file),
  );
  if (!themeFile) return [];
  const tokens = readThemeTokens(themeFile.content);
  if (!tokens) return [];
  return files.flatMap((file) =>
    SCANNED_FILE_RE.test(file.path) && !UI_PRIMITIVE_RE.test(file.path) ? checkFile(file, tokens) : [],
  );
}
