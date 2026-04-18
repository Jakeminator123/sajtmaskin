/**
 * Escape-leakage fixer — repair files that arrived JSON-double-encoded.
 *
 * Symptom: a file that should contain real newlines / quotes instead
 * carries the LITERAL two-character sequence `\n` (backslash + n) and
 * `\"` (backslash + double-quote) — sometimes also wrapped in outer
 * quotes. This is the well-known "stringified once too many" bug:
 * the file body was passed through `JSON.stringify` and a downstream
 * consumer treated the result as raw text instead of `JSON.parse`-ing
 * it back. Re-encoding once more produces `\\n` / `\\\\` and so on.
 *
 * This is the most common source of "constiga snedstreck" the user sees
 * across the pipeline (PowerShell pipes, sandbox writes without
 * `Buffer.from`, env-file round-trips, …). The defensive fixers/normalisers
 * already in the repo (`unicode-normalizer.ts`, the `normalize-text` route,
 * `tier3-sdk-guard-fixer`'s `\r?\n` split) all assume the *content* is
 * already-decoded text. This fixer guarantees that assumption holds by
 * unwrapping any obvious JSON-encoded payload before any other rule runs.
 *
 * Conservative on purpose: we only act when the signal is unambiguous,
 * never on legit code that simply happens to contain `"\n"` inside a
 * string literal.
 */

export type EscapeLeakageKind =
  /** Whole file is `"...\\n..."` — wrapped JSON string literal. */
  "wrapped-json-string";

export interface EscapeLeakageResult {
  code: string;
  fixed: boolean;
  kind: EscapeLeakageKind | null;
  /** Difference in length between original and repaired content. */
  bytesRecovered: number;
}

function tryJsonParseString(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function looksLikeWrappedJsonString(content: string): boolean {
  const trimmed = content.trim();
  // Need at least `"X\nY"` to be plausibly an encoded multi-line file.
  if (trimmed.length < 6) return false;
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return false;
  // Must contain at least one escape sequence — otherwise it's just
  // a one-line file that happens to be a quoted string literal
  // (e.g. `"use client";` does NOT match because it ends with `;`).
  return /\\[ntr"\\]/.test(trimmed);
}

/**
 * Detect-and-repair JSON-double-encoded file content.
 *
 * Detection rule:
 *
 *  - **wrapped-json-string** — content (after trim) starts with `"`,
 *    ends with `"`, contains at least one backslash-escape sequence,
 *    AND `JSON.parse` yields a string. Replace with the parsed string.
 *
 * We deliberately do NOT try to detect "naked" JSON-encoded payloads
 * (no surrounding quotes) — that case is fundamentally indistinguishable
 * from a one-line minified bundle with legit `"\n"` inside string
 * literals, so the false-positive risk dwarfs the value. If you need
 * to repair a stripped payload, re-wrap it in quotes upstream first
 * and let this fixer take care of the rest.
 *
 * We also do NOT collapse bare `\\\\` runs — that transformation is
 * only safe inside a JSON-decode context (the rule above); doing it
 * standalone would corrupt files that legitimately contain
 * double-escaped regex or shell strings.
 */
export function fixEscapeLeakage(code: string): EscapeLeakageResult {
  if (!code) {
    return { code, fixed: false, kind: null, bytesRecovered: 0 };
  }

  if (looksLikeWrappedJsonString(code)) {
    const parsed = tryJsonParseString(code.trim());
    if (parsed !== null && parsed !== code) {
      return {
        code: parsed,
        fixed: true,
        kind: "wrapped-json-string",
        bytesRecovered: code.length - parsed.length,
      };
    }
  }

  return { code, fixed: false, kind: null, bytesRecovered: 0 };
}
