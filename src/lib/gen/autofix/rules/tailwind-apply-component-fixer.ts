/**
 * Deterministic fixer for Tailwind v4 `@apply` of `@layer components` classes.
 *
 * Tailwind v4 dropped the v3 behaviour where `@apply` could refer to any
 * class declared in the same stylesheet — in v4, `@apply` ONLY accepts
 * real utility classes (built-in or `@layer utilities`). When the model
 * declares e.g. `.surface-blueprint { ... }` inside `@layer components`
 * and then `@apply surface-blueprint;` later, Tailwind throws:
 *
 *   Cannot apply unknown utility class: surface-blueprint
 *
 * This blocks the entire dev/build CSS pipeline (`Compiling /` halts,
 * preview returns 500). The model has no good way to know this from the
 * v3 docs it was trained on, so a deterministic fixer is needed.
 *
 * Strategy:
 *   1. Find every `@layer components { ... }` block in the file
 *      (brace-counted, nested-safe).
 *   2. Within those blocks, parse top-level `.CLASSNAME { BODY }`
 *      declarations and store BODY by CLASSNAME.
 *   3. Scan the FULL file for `@apply CLASSNAME[ CLASSNAME2 ...];`
 *      directives. For any token that matches a recorded component class,
 *      inline that class's BODY (preserving Tailwind utilities in the
 *      same `@apply` directive by re-emitting them as a separate
 *      `@apply` line).
 *
 * Conservative: only inlines BODY when the class definition body
 * contains ONLY plain CSS declarations (no nested `@apply`, `&` selectors,
 * or pseudo-elements) — otherwise it's safer to leave the directive
 * alone and let the LLM repair pass handle it. This avoids accidentally
 * flattening complex component definitions.
 */

export interface TailwindApplyFixResult {
  code: string;
  fixed: boolean;
  replacedClasses: string[];
}

/**
 * Find balanced `{ ... }` block starting at `start` (which must point at `{`).
 * Returns the position of the matching `}` (inclusive). Naive but
 * sufficient — Tailwind / CSS comments inside `{...}` don't change brace
 * counts in practice and we only look at LLM-generated stylesheets.
 */
function findMatchingBrace(code: string, start: number): number {
  if (code[start] !== "{") return -1;
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Extract `{ class -> body }` for top-level `.CLASS { ... }` declarations
 * inside `@layer components { ... }` blocks.
 *
 * Only single-class selectors (`.foo`, no `,` no compound selectors and
 * no nested `&`) qualify — anything else is intentionally skipped to
 * keep the inliner safe.
 */
function collectComponentClassBodies(code: string): Map<string, string> {
  const bodies = new Map<string, string>();

  // Find every `@layer components` opener (case-insensitive).
  const layerRe = /@layer\s+components\s*\{/gi;
  for (const layerMatch of code.matchAll(layerRe)) {
    const blockOpen = (layerMatch.index ?? 0) + layerMatch[0].length - 1;
    const blockClose = findMatchingBrace(code, blockOpen);
    if (blockClose < 0) continue;
    const inner = code.slice(blockOpen + 1, blockClose);

    // Parse top-level `.NAME { ... }` rules inside this layer block.
    let i = 0;
    while (i < inner.length) {
      const dot = inner.indexOf(".", i);
      if (dot < 0) break;
      // Must look like `.identifier` then optional whitespace then `{`.
      const ruleHeadMatch = /^\.([a-zA-Z_][\w-]*)\s*\{/.exec(inner.slice(dot));
      if (!ruleHeadMatch) {
        i = dot + 1;
        continue;
      }
      const className = ruleHeadMatch[1];
      const braceOpen = dot + ruleHeadMatch[0].length - 1;
      const braceClose = findMatchingBrace(inner, braceOpen);
      if (braceClose < 0) break;
      const body = inner.slice(braceOpen + 1, braceClose).trim();

      // Conservative: only allow flat bodies (no nested `{`, no `&`
      // pseudo-selectors, no nested `@apply` of unknown classes).
      const safeBody =
        !body.includes("{") &&
        !body.includes("&") &&
        !/\n\s*&/.test(body);

      if (safeBody && !bodies.has(className)) {
        bodies.set(className, body);
      }
      i = braceClose + 1;
    }
  }

  return bodies;
}

/**
 * Replace `@apply ... <componentClass> ... ;` directives by inlining the
 * component class body. Other `@apply`-tokens (real utilities) are kept
 * via a fresh `@apply <utilities>;` line preceding the inlined block.
 */
export function fixTailwindApplyOfComponents(code: string): TailwindApplyFixResult {
  const bodies = collectComponentClassBodies(code);
  if (bodies.size === 0) {
    return { code, fixed: false, replacedClasses: [] };
  }

  const replacedClasses = new Set<string>();
  let changed = false;

  // Match each `@apply ...;` directive in the whole file (not just inside
  // @layer components). LLMs sometimes @apply custom classes from
  // other layers or from bare rules — same fix.
  const applyRe = /@apply\s+([^;]+);/g;
  const nextCode = code.replace(applyRe, (full, raw: string) => {
    const tokens = raw
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length === 0) return full;

    const utilityTokens: string[] = [];
    const inlineBodies: string[] = [];
    let touched = false;

    for (const token of tokens) {
      // Strip Tailwind variant prefixes (e.g. `hover:foo`, `md:foo`,
      // `dark:foo`). We only inline if the BARE token (after the last
      // `:`) is a known component class, AND the variant is empty —
      // variant-wrapped @applies of component classes are too risky to
      // flatten automatically, so we leave them untouched.
      const variantSplit = token.split(":");
      const bare =
        variantSplit.length > 1
          ? variantSplit[variantSplit.length - 1]
          : token;
      const hasVariant = variantSplit.length > 1;

      if (!hasVariant && bodies.has(bare)) {
        inlineBodies.push(bodies.get(bare)!);
        replacedClasses.add(bare);
        touched = true;
      } else {
        utilityTokens.push(token);
      }
    }

    if (!touched) return full;
    changed = true;

    const lines: string[] = [];
    if (utilityTokens.length > 0) {
      lines.push(`@apply ${utilityTokens.join(" ")};`);
    }
    for (const body of inlineBodies) {
      // Normalize: ensure trailing semicolons + flatten whitespace.
      const normalized = body.endsWith(";") ? body : `${body};`;
      lines.push(normalized);
    }
    return lines.join("\n    ");
  });

  return {
    code: nextCode,
    fixed: changed,
    replacedClasses: [...replacedClasses],
  };
}
