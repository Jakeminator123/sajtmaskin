import type { CodeFile } from "@/lib/gen/parser";
import type { PreflightIssueCategory } from "@/lib/gen/stream/preflight-contract";

/**
 * Non-deterministic-render (hydration-risk) preflight.
 *
 * v0/imported templates frequently compute rendered values with `Math.random()`,
 * `Date.now()`, `new Date()`, etc. directly in component render (or a
 * `useState(() => …)` initializer / `useMemo`), which runs on BOTH the server
 * and the client. The two runs disagree, so React throws a hydration mismatch
 * ("A tree hydrated but some attributes of the server rendered HTML didn't
 * match the client properties") and the preview flickers / errors. The observed
 * case was a "Masonry Grid" template whose card colors + heights were picked
 * with `Math.random()` in a `useState` initializer, and a follow-up edit kept
 * the same non-determinism.
 *
 * This is an ADVISORY-only detector: it emits `warning` /
 * `non_blocking_quality_warning` issues so the builder surfaces a concrete,
 * actionable message instead of the user only seeing a console hydration error.
 * It never blocks preview. Calls proven client-only (inside `useEffect` /
 * `useLayoutEffect` or an event handler) are ignored to keep false positives
 * low; `useMemo` is intentionally NOT treated as safe because it also runs
 * during SSR.
 */

export type HydrationPreflightIssue = {
  file: string;
  severity: "warning";
  code: "nondeterministic-render";
  message: string;
  category: PreflightIssueCategory;
  line: number;
  pattern: string;
};

const SCAN_EXTENSIONS = [".tsx", ".jsx"] as const;

/** Tokens whose value differs between the server render and the client render. */
const RISKY_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "Math.random()", re: /\bMath\s*\.\s*random\s*\(/g },
  { label: "Date.now()", re: /\bDate\s*\.\s*now\s*\(/g },
  { label: "performance.now()", re: /\bperformance\s*\.\s*now\s*\(/g },
  { label: "crypto.randomUUID()", re: /\bcrypto\s*\.\s*randomUUID\s*\(/g },
  // `new Date()` with no argument renders the current instant → server/client differ.
  // `new Date(someArg)` is deterministic and intentionally not matched.
  { label: "new Date()", re: /\bnew\s+Date\s*\(\s*\)/g },
];

/**
 * Client-only wrappers whose callback bodies run AFTER hydration, so a
 * non-deterministic value there cannot cause a mismatch. `useMemo`/`useCallback`
 * are deliberately excluded (they run during SSR too).
 */
const SAFE_WRAPPER_RES: RegExp[] = [
  /\buseEffect\s*\(/g,
  /\buseLayoutEffect\s*\(/g,
];

/**
 * JSX event-handler attributes (`onClick={…}`, `onChange={…}`, any
 * `on[A-Z]…={…}`). Handler bodies never run during SSR/hydration — React only
 * attaches them after hydration — and handler values are not serialized into
 * the server HTML, so non-determinism inside the braces cannot cause a
 * mismatch. The pattern ends on the opening `{`; the range is closed by
 * balanced-brace scanning so multiline handlers are covered.
 */
const JSX_EVENT_HANDLER_RE = /\bon[A-Z]\w*\s*=\s*\{/g;

/**
 * Replace comments and string/template literals with same-length whitespace so
 * token/brace scanning never matches inside them. Newlines are preserved so
 * line numbers stay accurate.
 */
function blankStringsAndComments(source: string): string {
  const out = source.split("");
  let i = 0;
  const n = source.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      let j = i + 2;
      while (j < n && source[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (ch === "/" && next === "*") {
      let j = i + 2;
      while (j < n && !(source[j] === "*" && source[j + 1] === "/")) j++;
      j = Math.min(n, j + 2);
      blank(i, j);
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      blank(i, j);
      i = j;
      continue;
    }
    i++;
  }
  return out.join("");
}

/**
 * Given the index of an opening delimiter's owning call (a `(` at or after
 * `fromIndex`), return the inclusive end index of the balanced `(...)`.
 * Operates on already-blanked source (no strings/comments to skip).
 */
function findBalancedParenEnd(source: string, fromIndex: number): number | null {
  let start = -1;
  for (let i = fromIndex; i < source.length; i++) {
    if (source[i] === "(") {
      start = i;
      break;
    }
    // Stop if we hit a non-space before an opening paren — the wrapper regex
    // already matched up to `(`, so this should be immediate.
  }
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

/**
 * Given the index of an opening `{` in already-blanked source, return the
 * inclusive end index of the balanced `{...}` (or null when unbalanced).
 */
function findBalancedBraceEnd(blanked: string, openIndex: number): number | null {
  let depth = 0;
  for (let i = openIndex; i < blanked.length; i++) {
    const ch = blanked[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

/** Ranges (in blanked source) whose contents run client-only post-hydration. */
function collectSafeRanges(blanked: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const baseRe of SAFE_WRAPPER_RES) {
    const re = new RegExp(baseRe.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(blanked)) !== null) {
      // Move to the `(` that the pattern ends on and balance it.
      const parenIdx = blanked.indexOf("(", m.index);
      if (parenIdx === -1) continue;
      const end = findBalancedParenEnd(blanked, parenIdx);
      if (end !== null) ranges.push({ start: m.index, end });
    }
  }
  // JSX event handlers: the pattern ends on the attribute's opening `{`;
  // balance it so multiline handler bodies are fully covered.
  const handlerRe = new RegExp(JSX_EVENT_HANDLER_RE.source, "g");
  let hm: RegExpExecArray | null;
  while ((hm = handlerRe.exec(blanked)) !== null) {
    const braceIdx = hm.index + hm[0].length - 1;
    const end = findBalancedBraceEnd(blanked, braceIdx);
    if (end !== null) ranges.push({ start: hm.index, end });
  }
  return ranges;
}

function isInsideSafeRange(
  index: number,
  ranges: Array<{ start: number; end: number }>,
): boolean {
  return ranges.some((r) => index >= r.start && index <= r.end);
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

function shouldScan(path: string): boolean {
  const norm = path.replace(/\\/g, "/").toLowerCase();
  return SCAN_EXTENSIONS.some((ext) => norm.endsWith(ext));
}

/**
 * Scan a single file's source for render-scope non-determinism. Returns the
 * first risky occurrence per distinct pattern (deduped) that is NOT inside a
 * client-only wrapper. Exported for unit tests + reuse by the template import
 * advisory path.
 */
export function detectNonDeterministicRenderInSource(
  path: string,
  source: string,
): HydrationPreflightIssue[] {
  const blanked = blankStringsAndComments(source);
  const safeRanges = collectSafeRanges(blanked);
  const issues: HydrationPreflightIssue[] = [];
  const seenPatterns = new Set<string>();

  for (const { label, re } of RISKY_PATTERNS) {
    const scan = new RegExp(re.source, "g");
    let m: RegExpExecArray | null;
    while ((m = scan.exec(blanked)) !== null) {
      if (isInsideSafeRange(m.index, safeRanges)) continue;
      if (seenPatterns.has(label)) break;
      seenPatterns.add(label);
      issues.push({
        file: path,
        severity: "warning",
        code: "nondeterministic-render",
        message:
          `${label} is used in render scope in ${path} — this produces different ` +
          `server and client output and causes a React hydration mismatch ` +
          `(flicker / console error). Move it into a useEffect after mount, or ` +
          `use deterministic values (e.g. seeded by index).`,
        category: "non_blocking_quality_warning",
        line: lineOf(source, m.index),
        pattern: label,
      });
      break;
    }
  }

  return issues;
}

/** Project-wide scan across all client component files (tsx/jsx). */
export function runHydrationPreflightChecks(files: CodeFile[]): HydrationPreflightIssue[] {
  const issues: HydrationPreflightIssue[] = [];
  for (const file of files) {
    if (!file?.path || typeof file.content !== "string") continue;
    if (!shouldScan(file.path)) continue;
    issues.push(...detectNonDeterministicRenderInSource(file.path, file.content));
  }
  return issues;
}
