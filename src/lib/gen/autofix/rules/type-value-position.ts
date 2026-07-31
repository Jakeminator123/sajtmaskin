/**
 * Shared type-vs-value position heuristic for the two `import type` fixers.
 *
 * `type-only-import-fixer` (value import → `import type`) and
 * `value-used-from-type-import-fixer` (`import type` → value import) are exact
 * mirrors of each other. They must agree on every occurrence or they oscillate:
 * one converts an import, the next pass converts it straight back. Both used to
 * carry their own copy of this function, which made that agreement a promise in
 * a doc comment rather than something the code enforced. It now lives here once.
 *
 * The heuristic is deliberately regex-based (per-file, side-effect-free, no
 * parse step) and answers `"unknown"` whenever context is ambiguous; callers
 * treat that as "do not convert".
 */

export type Classification = "type" | "value" | "unknown";

const VALUE_NEW_RE = /\bnew\s*$/;
const VALUE_TYPEOF_RE = /\btypeof\s+$/;
/** Type-position preceders excluding `<`, which gets JSX-vs-generic handling. */
const TYPE_PRECEDER_RE = /(?:[:,|&?]|\b(?:as|satisfies|extends|implements|keyof))\s*$/;
/** `{ key:` / `, key:` — an object-literal property key, or an interface member. */
const PROPERTY_KEY_RE =
  /[{,]\s*(?:[A-Za-z_$][\w$]*|"[^"]*"|'[^']*'|\[[^\]]*\])\s*\??\s*:\s*$/;

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `Foo` or `Foo as Bar` — only the local binding (`Bar`) is referenced. */
export function bindingNameOf(specifier: string): string {
  const aliasMatch = specifier.match(/^[A-Za-z_$][\w$]*\s+as\s+([A-Za-z_$][\w$]*)\s*$/);
  if (aliasMatch) return aliasMatch[1];
  return specifier.trim();
}

/**
 * Offset of the `{` that encloses `idx`, or -1. Brace counting ignores braces
 * inside strings and comments, which is acceptable for a heuristic: a
 * miscount degrades to `"unknown"` and blocks the conversion.
 */
function enclosingBraceStart(code: string, idx: number): number {
  let depth = 0;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const ch = code[i];
    if (ch === "}") {
      depth += 1;
    } else if (ch === "{") {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
}

/**
 * Whether the block enclosing `idx` is a value expression (object literal) or a
 * type body (interface / type alias / annotation).
 *
 * This is what separates `const seed = { posts: blogPosts }` (a VALUE use of
 * `blogPosts`) from `interface Seed { posts: BlogPost }` (a TYPE use). Both
 * look identical to the bare `:` lookbehind in `TYPE_PRECEDER_RE`.
 */
function enclosingBlockKind(code: string, idx: number): Classification {
  const braceIdx = enclosingBraceStart(code, idx);
  if (braceIdx === -1) return "unknown";
  const head = code.slice(Math.max(0, braceIdx - 96), braceIdx);

  // `interface Foo {` / `type Foo = {` / `type Foo<T> = {`
  if (/\b(?:interface|type)\s+[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*=?\s*$/.test(head)) {
    return "type";
  }
  // `const x: {` / `): {` — a type annotation whose body is an object type.
  if (/:\s*$/.test(head)) return "type";
  // `= {` / `({` / `, {` / `[{` / `return {` — a value expression.
  if (/[=(,[]\s*$/.test(head)) return "value";
  if (/\breturn\s*\(?\s*$/.test(head)) return "value";
  return "unknown";
}

/**
 * Classify a single occurrence of a symbol of length `len` at `idx` in `code`.
 */
export function classifyOccurrence(code: string, idx: number, len: number): Classification {
  const before = code.slice(Math.max(0, idx - 32), idx);
  const after = code.slice(idx + len, idx + len + 24);

  // Strong value indicators (preceded by).
  if (VALUE_NEW_RE.test(before)) return "value";
  if (VALUE_TYPEOF_RE.test(before)) return "value";

  // Strong value indicators (followed by).
  if (/^\s*\(/.test(after)) return "value"; // X(...)
  if (/^\s*\./.test(after)) return "value"; // X.member
  if (/^\s*=[^=>]/.test(after)) return "value"; // assignment, not ==/===/=>

  // `<` precedes — JSX `<Component …>` OR a type generic `Wrapper<TypeArg>`.
  if (/<\s*$/.test(before)) {
    if (/^\s+\w+\s*=/.test(after)) return "value"; // <X attr=
    if (/^\s*\/\s*>/.test(after)) return "value"; // <X/>
    if (/^\s*>/.test(after)) {
      const past = after.slice(after.indexOf(">") + 1);
      if (/^\s*([;,)\]}|&]|$)/.test(past)) return "type";
      if (/^\s*[<{a-zA-Z0-9]/.test(past)) return "value";
      return "unknown";
    }
    if (/^\s*[,|&]/.test(after)) return "type"; // <X, Y> / <X | Y>
    return "unknown";
  }

  if (TYPE_PRECEDER_RE.test(before)) {
    // A bare `:` cannot distinguish `{ posts: blogPosts }` (value) from
    // `{ posts: BlogPost }` (type). Widen the window past the property key and
    // ask what kind of block we are standing in.
    const wide = code.slice(Math.max(0, idx - 160), idx);
    if (PROPERTY_KEY_RE.test(wide) && enclosingBlockKind(code, idx) === "value") {
      return "value";
    }
    return "type";
  }

  return "unknown";
}
