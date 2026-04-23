/**
 * DOM-builtin JSX fixer.
 *
 * Background: LLMs occasionally emit `<HTMLFormElement>` or
 * `<HTMLInputElement>` as a JSX tag, confusing the DOM *interface* with the
 * lowercase HTML tag. TypeScript rejects this at build time (unresolved JSX
 * symbol) and the page renders blank. The existing `jsx-checker.ts` detects
 * the pattern via `isDenylistedStubDefaultName` but only **warns** (it
 * refuses to generate a stub import for the name). That leaves the invalid
 * JSX intact.
 *
 * Empirical hit (chat `341cdc37...`, 2026-04-23):
 * `components/contact-form-section.tsx` shipped with
 *
 *   <HTMLFormElement onSubmit={handleSubmit}>...</HTMLFormElement>
 *
 * — the file parsed but Next bailed on build with unresolved JSX. This
 * fixer rewrites the tag to the correct lowercase HTML element:
 *
 *   <form onSubmit={handleSubmit}>...</form>
 *
 * Scope: per-file, regex-based, side-effect-free. Handles both self-closing
 * (`<HTMLxxxElement />`) and paired (`<HTMLxxxElement>...</HTMLxxxElement>`)
 * forms. Known mappings are hand-curated; unknown `<HTMLxxxElement>` tags
 * trigger a warning and rewrite to `<div>` (safer default than crashing).
 *
 * SVG interface tags (`<SVGSvgElement>` etc.) are denylisted too but have
 * no sensible lowercase fallback besides `<svg>`; rather than special-case
 * those we only rewrite HTML-prefixed tags here.
 */

import type { FixEntry } from "../types";

const KNOWN_HTML_INTERFACE_TO_TAG: Record<string, string> = {
  HTMLFormElement: "form",
  HTMLInputElement: "input",
  HTMLTextAreaElement: "textarea",
  HTMLSelectElement: "select",
  HTMLOptionElement: "option",
  HTMLButtonElement: "button",
  HTMLDivElement: "div",
  HTMLSpanElement: "span",
  HTMLParagraphElement: "p",
  HTMLAnchorElement: "a",
  HTMLImageElement: "img",
  HTMLUListElement: "ul",
  HTMLOListElement: "ol",
  HTMLLIElement: "li",
  HTMLTableElement: "table",
  HTMLTableRowElement: "tr",
  HTMLTableCellElement: "td",
  HTMLHeadingElement: "h2", // ambiguous h1-h6; h2 is the most common content header
  HTMLLabelElement: "label",
  HTMLVideoElement: "video",
  HTMLAudioElement: "audio",
  HTMLCanvasElement: "canvas",
  HTMLPreElement: "pre",
  HTMLIFrameElement: "iframe",
};

// The negative lookbehind guards against matching TypeScript generic type
// positions like `FormEvent<HTMLFormElement>` where `<` is preceded by an
// identifier. JSX opening tags are only preceded by whitespace, `(`, `{`,
// `;`, `=`, `>`, `,`, `!`, `&`, `|`, `?`, `:`, `[`, or line start.
const HTML_INTERFACE_TAG_RE =
  /(?<![A-Za-z0-9_$.])<(HTML[A-Z][A-Za-z0-9]*Element)(\s[^>]*?)?(\s*\/)?>/g;
const HTML_INTERFACE_CLOSING_TAG_RE = /<\/(HTML[A-Z][A-Za-z0-9]*Element)\s*>/g;

type FixResult = {
  code: string;
  fixed: boolean;
  fixes: FixEntry[];
  warnings: string[];
};

function resolveReplacementTag(name: string): { tag: string; isFallback: boolean } {
  const known = KNOWN_HTML_INTERFACE_TO_TAG[name];
  if (known) return { tag: known, isFallback: false };
  return { tag: "div", isFallback: true };
}

/**
 * Rewrite `<HTMLxxxElement>` JSX tags (opening, self-closing, and matching
 * closing tags) to their lowercase HTML equivalent. Returns the rewritten
 * code plus a warning list for any unknown interface name that fell back
 * to `<div>`.
 */
export function fixDomBuiltinJsxTags(code: string, filePath: string): FixResult {
  if (!/HTML[A-Z][A-Za-z0-9]*Element/.test(code)) {
    return { code, fixed: false, fixes: [], warnings: [] };
  }

  const replacedTags = new Map<string, string>();
  const fallbackNames = new Set<string>();

  // Pass 1: replace opening + self-closing tags. Tracks which interface →
  // which lowercase tag so closing tags can mirror the choice.
  const nextCode = code.replace(
    HTML_INTERFACE_TAG_RE,
    (_match, name: string, attrs: string | undefined, selfClose: string | undefined) => {
      const { tag, isFallback } = resolveReplacementTag(name);
      replacedTags.set(name, tag);
      if (isFallback) fallbackNames.add(name);
      const attrPart = attrs ?? "";
      const closePart = selfClose ?? "";
      return `<${tag}${attrPart}${closePart}>`;
    },
  );

  if (replacedTags.size === 0) {
    return { code, fixed: false, fixes: [], warnings: [] };
  }

  // Pass 2: mirror closing tags.
  const finalCode = nextCode.replace(
    HTML_INTERFACE_CLOSING_TAG_RE,
    (match, name: string) => {
      const tag = replacedTags.get(name);
      if (!tag) return match; // interface only appeared as closing (weird, leave alone)
      return `</${tag}>`;
    },
  );

  const warnings: string[] = [];
  for (const name of fallbackNames) {
    warnings.push(
      `[${filePath}] Rewrote unknown \`<${name}>\` JSX tag to \`<div>\` — please review.`,
    );
  }

  const descriptionParts = [...replacedTags.entries()]
    .map(([name, tag]) => `<${name}> → <${tag}>`)
    .join(", ");

  return {
    code: finalCode,
    fixed: true,
    fixes: [
      {
        fixer: "dom-builtin-jsx-fixer",
        category: "mechanical",
        description: `Rewrote DOM-interface JSX tags to lowercase HTML elements: ${descriptionParts}`,
        file: filePath,
      },
    ],
    warnings,
  };
}
