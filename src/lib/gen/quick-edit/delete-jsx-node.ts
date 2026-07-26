import ts from "typescript";
import {
  countParseErrors,
  createTsxSourceFile,
} from "@/lib/gen/autofix/rules/import-binding-ast";

/**
 * Deterministic, AST-based removal of one complete JSX node (opening tag,
 * children and closing tag) from a file. Used by the inspector's "ta bort
 * element" action, which knows a `filePath` + 1-based `lineNumber` + tag name
 * for the clicked element but nothing about the surrounding syntax.
 *
 * Regex removal is deliberately not an option here: unbalanced tags produce
 * unparsable JSX. Locating is done on the TypeScript AST; the edit itself is a
 * plain text splice of the node's exact span so nothing else is reformatted.
 * The result is only returned when the parse-error count did not increase.
 */

/** JSX is only valid in these dialects — `.ts` parses `<Tag>` as a type assertion. */
const JSX_CAPABLE_EXT_RE = /\.(?:[mc]?jsx?|tsx)$/i;

/** Locator spellings the inspector may use for `<>...</>`. */
const FRAGMENT_LOCATOR_TAGS = new Set(["", "<>", "fragment", "react.fragment"]);

type TargetableJsxNode = ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment;

export type DeleteJsxNodeLocator = {
  /** 1-based line holding the element's opening `<`. */
  lineNumber: number;
  /** Tag name at that line. `""`, `"<>"` or `"Fragment"` targets a JSX fragment. */
  tagName: string;
};

export type DeleteJsxNodeFailureReason =
  /** Not a dialect that can contain JSX (`.ts`, `.css`, …). */
  | "unsupported_file"
  /** `lineNumber` is not a positive integer. */
  | "invalid_locator"
  /** No JSX element/fragment starts on that line. */
  | "node_not_found"
  /** JSX starts on that line, but none of it carries the requested tag. */
  | "tag_mismatch"
  /** The node is the whole return value of a component/arrow body. */
  | "sole_return_value"
  /** The parse guard rejected the result. */
  | "parse_regression";

export type DeleteJsxNodeResult =
  | {
      ok: true;
      content: string;
      /** Exact text removed, including any whole-line whitespace. */
      removed: string;
      /** Tag as written in the source (`""` for a fragment). */
      tagName: string;
    }
  | { ok: false; reason: DeleteJsxNodeFailureReason; message: string };

function isTargetableJsx(node: ts.Node): node is TargetableJsxNode {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);
}

/** Source tag text, or `""` for a fragment. */
function jsxTagText(node: TargetableJsxNode, sf: ts.SourceFile): string {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText(sf);
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(sf);
  return "";
}

/**
 * The bridge reports the rendered DOM tag (`button`), which can differ in case
 * from the source tag of a component (`<Button>`), so an exact match is tried
 * first and case-insensitive equality is the fallback.
 */
function tagMatches(sourceTag: string, requested: string): boolean {
  const wanted = requested.trim();
  if (sourceTag === "") return FRAGMENT_LOCATOR_TAGS.has(wanted.toLowerCase());
  if (wanted === "") return false;
  if (sourceTag === wanted) return true;
  return sourceTag.toLowerCase() === wanted.toLowerCase();
}

function collectJsxNodesStartingOnLine(
  sf: ts.SourceFile,
  zeroBasedLine: number,
): TargetableJsxNode[] {
  const found: TargetableJsxNode[] = [];
  const visit = (node: ts.Node): void => {
    if (isTargetableJsx(node)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
      if (line === zeroBasedLine) found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/**
 * True when the node *is* the value a component renders (`return <X/>` or a
 * concise arrow body). Removing it leaves a component with no element to
 * return — `return ;` still parses, so the parse guard cannot catch this.
 */
function isSoleReturnedExpression(node: ts.Node): boolean {
  let current: ts.Node = node;
  let parent: ts.Node | undefined = current.parent;
  while (parent && ts.isParenthesizedExpression(parent)) {
    current = parent;
    parent = current.parent;
  }
  if (!parent) return false;
  if (ts.isReturnStatement(parent)) return parent.expression === current;
  if (ts.isArrowFunction(parent)) return parent.body === current;
  return false;
}

/**
 * Span to splice out. When the node sits alone on its line(s), the surrounding
 * indentation and the trailing newline go with it so no blank hole is left;
 * otherwise only the node's own span is removed.
 */
function deletionRange(
  content: string,
  node: TargetableJsxNode,
  sf: ts.SourceFile,
): { start: number; end: number } {
  const nodeStart = node.getStart(sf);
  const nodeEnd = node.getEnd();

  const lineStart = content.lastIndexOf("\n", nodeStart - 1) + 1;
  const nextNewline = content.indexOf("\n", nodeEnd);
  const lineEnd = nextNewline === -1 ? content.length : nextNewline;

  const before = content.slice(lineStart, nodeStart);
  const after = content.slice(nodeEnd, lineEnd);
  if (/^\s*$/.test(before) && /^\s*$/.test(after)) {
    return {
      start: lineStart,
      end: nextNewline === -1 ? content.length : nextNewline + 1,
    };
  }
  return { start: nodeStart, end: nodeEnd };
}

function fail(
  reason: DeleteJsxNodeFailureReason,
  message: string,
): DeleteJsxNodeResult {
  return { ok: false, reason, message };
}

export function deleteJsxNode(
  content: string,
  filePath: string,
  locator: DeleteJsxNodeLocator,
): DeleteJsxNodeResult {
  if (!JSX_CAPABLE_EXT_RE.test(filePath)) {
    return fail("unsupported_file", `${filePath} cannot contain JSX.`);
  }
  if (!Number.isInteger(locator.lineNumber) || locator.lineNumber < 1) {
    return fail("invalid_locator", `Invalid line number: ${locator.lineNumber}.`);
  }

  const sf = createTsxSourceFile(filePath, content);
  const candidates = collectJsxNodesStartingOnLine(sf, locator.lineNumber - 1);
  if (candidates.length === 0) {
    return fail(
      "node_not_found",
      `No JSX element starts on line ${locator.lineNumber} in ${filePath}.`,
    );
  }

  const matching = candidates.filter((node) =>
    tagMatches(jsxTagText(node, sf), locator.tagName),
  );
  if (matching.length === 0) {
    const seen = candidates.map((node) => jsxTagText(node, sf) || "<>").join(", ");
    return fail(
      "tag_mismatch",
      `No <${locator.tagName}> on line ${locator.lineNumber} in ${filePath} (found: ${seen}).`,
    );
  }

  // Smallest span = innermost element starting on that line.
  const target = matching.reduce((smallest, node) =>
    node.getWidth(sf) < smallest.getWidth(sf) ? node : smallest,
  );
  if (isSoleReturnedExpression(target)) {
    return fail(
      "sole_return_value",
      `<${locator.tagName}> is the only value its component returns; removing it would leave an empty component.`,
    );
  }

  const { start, end } = deletionRange(content, target, sf);
  const nextContent = content.slice(0, start) + content.slice(end);

  if (countParseErrors(nextContent, filePath) > countParseErrors(content, filePath)) {
    return fail(
      "parse_regression",
      `Removing <${locator.tagName}> from ${filePath} would leave the file unparsable.`,
    );
  }

  return {
    ok: true,
    content: nextContent,
    removed: content.slice(start, end),
    tagName: jsxTagText(target, sf),
  };
}
