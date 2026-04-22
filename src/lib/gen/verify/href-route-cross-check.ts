/**
 * Deterministic href ↔ App Router route cross-check.
 *
 * Scans generated `.tsx` / `.jsx` files for navigation expressions
 * (`<Link href="/...">`, `href="/..."`, `router.push("/...")`,
 * `redirect("/...")`) and validates that every internal href resolves to an
 * actual app-route present in the generated files.
 *
 * Designed as a safety net behind {@link buildRoutePlan}'s locale-alternate
 * dedupe: even when the LLM gets a clean route plan, it can still emit stale
 * `/blog/${slug}` links by habit when the actual route is `/blogg/[slug]`.
 * The verifier's `navigation-placeholder-actions` rule is QA-grade text
 * inspection — this module is the pure code-analysis counterpart.
 *
 * Severity is owned by the caller. Today {@link runFinalizePreflight} emits
 * mismatches as `non_blocking_quality_warning` (see plan
 * `docs/plans/active/repair-loop-hardening.md` for the gate-flip path).
 */

import type { CodeFile } from "@/lib/gen/parser";
import { normalizeRoutePath, routePatternToRegex } from "@/lib/gen/route-plan";

export interface ExtractedHref {
  /** Source file (App Router-relative or `src/`-prefixed). */
  file: string;
  /** 1-based line number where the href literal starts. */
  line: number;
  /** Raw href value as it appeared (template literal sigils stripped to base). */
  raw: string;
  /** Static prefix of the href that should match an actual route. */
  basePath: string;
  /**
   * True when the original href contained `${...}` (template literal). For
   * these, a missing exact match is acceptable when an actual dynamic route
   * starts with the same static prefix (e.g. href `/blogg/${slug}` against
   * route `/blogg/[slug]`).
   */
  isDynamic: boolean;
}

export interface HrefRouteMismatch extends ExtractedHref {
  /** Closest known route (Levenshtein ≤ 2) or null when nothing reasonable found. */
  suggestion: string | null;
}

/** Files that emit hrefs we care about. JSX/TSX only — pure TS modules don't render links. */
const SCANNED_FILE_RE = /\.(tsx|jsx)$/i;

/**
 * Match navigation hrefs that start with `/`. Captures:
 * - `<Link href="/foo">` / `href='/foo'`
 * - `href={"/foo"}` / `href={'/foo'}`
 * - `` href={`/foo/${id}`} `` (template literals — captured up to the first `${`)
 * - `router.push("/foo")` / `router.replace("/foo")` / `router.prefetch("/foo")`
 * - `redirect("/foo")` (Next.js server redirect)
 *
 * We deliberately ignore `to=`, `action=`, `formAction=` etc. — those don't
 * trip on the /blog vs /blogg pattern this module exists to catch.
 *
 * Each alternative is on its own line for readability; the alternatives are
 * joined into a single global regex below. No source-level whitespace ends
 * up in the compiled pattern because every alternative is a complete token.
 */
const HREF_PATTERNS = [
  // href="..." and href='...'
  String.raw`\bhref=\s*"(\/[^"\s]*)"`,
  String.raw`\bhref=\s*'(\/[^'\s]*)'`,
  // href={"..."} and href={'...'}
  String.raw`\bhref=\s*\{\s*"(\/[^"\s]*)"\s*\}`,
  String.raw`\bhref=\s*\{\s*'(\/[^'\s]*)'\s*\}`,
  // href={`/.../${...}`} — capture the literal prefix up to the first ${ or `
  String.raw`\bhref=\s*\{\s*` + "`" + String.raw`(\/[^` + "`" + String.raw`$]*)`,
  // router.push/replace/prefetch("...") and redirect/permanentRedirect("...")
  String.raw`\b(?:router\.(?:push|replace|prefetch)|redirect|permanentRedirect)\(\s*"(\/[^"\s]*)"`,
  String.raw`\b(?:router\.(?:push|replace|prefetch)|redirect|permanentRedirect)\(\s*'(\/[^'\s]*)'`,
  String.raw`\b(?:router\.(?:push|replace|prefetch)|redirect|permanentRedirect)\(\s*` + "`" + String.raw`(\/[^` + "`" + String.raw`$]*)`,
];
const NAV_HREF_RE = new RegExp(HREF_PATTERNS.join("|"), "g");

/**
 * Strip `?query` and `#fragment` from an href before any further analysis.
 * Both segments are irrelevant to route resolution (Next.js routes match on
 * pathname only) and would otherwise either falsely fail the matcher
 * (`/about?ref=foo` vs `/about`) or mask genuine pure-anchor links from the
 * skip-rule (`/#section` should be treated identically to `/#`).
 *
 * Order matters: `?` may appear before `#` in URLs, but never the other way
 * around per RFC 3986. Cutting at whichever appears first yields the
 * pathname unchanged for both `/about#section?x` and `/about?x#section`.
 */
function pathnameOnly(raw: string): string {
  const queryIdx = raw.indexOf("?");
  const hashIdx = raw.indexOf("#");
  let cutAt = -1;
  if (queryIdx !== -1 && hashIdx !== -1) cutAt = Math.min(queryIdx, hashIdx);
  else if (queryIdx !== -1) cutAt = queryIdx;
  else if (hashIdx !== -1) cutAt = hashIdx;
  return cutAt === -1 ? raw : raw.slice(0, cutAt);
}

/**
 * Compute the static base of a href. For template literals like `/blogg/${slug}`
 * the base is the longest leading static path: `/blogg`. For pure static
 * hrefs, base equals the href itself. Trailing slashes are normalized.
 *
 * Query and hash fragments are stripped first so that `/about?ref=nav` and
 * `/about#cta` both resolve against the `/about` route instead of producing
 * false-positive cross-check warnings.
 */
function staticBaseOfHref(raw: string): string {
  if (!raw.startsWith("/")) return raw;
  const pathname = pathnameOnly(raw);
  const dollarIdx = pathname.indexOf("${");
  const trimmed = dollarIdx === -1 ? pathname : pathname.slice(0, dollarIdx);
  // Drop trailing slash and any partial dynamic segment leftovers.
  const cleaned = trimmed.replace(/\/+$/, "") || "/";
  return normalizeRoutePath(cleaned);
}

/**
 * Hrefs we never validate against actual routes.
 * Hash-only anchors (`/#section`, `/#`) and bare query targets (`/?ref=foo`
 * resolving to root) are skipped because their pathname is `/` — the
 * cross-check has no useful signal to add for a link to the current page.
 */
function shouldSkipHref(raw: string): boolean {
  if (!raw.startsWith("/")) return true;
  if (raw.startsWith("//")) return true; // protocol-relative external
  if (raw.startsWith("/api/")) return true; // API endpoints, not pages
  if (raw.startsWith("/_next/")) return true; // Next.js internals
  // Treat pure hash/query targets ("/#", "/#hero", "/?ref=nav") as skippable —
  // the resolved pathname is "/" so cross-check has no useful signal to add.
  const pathname = pathnameOnly(raw);
  if (pathname === "/" && raw !== "/") return true;
  if (pathname === "") return true;
  return false;
}

/**
 * Scan generated files and extract internal navigation hrefs with line numbers.
 * Skips non-JSX files, externals, anchors, API routes, and Next.js internals.
 */
export function extractHrefsFromFiles(files: CodeFile[]): ExtractedHref[] {
  const found: ExtractedHref[] = [];
  for (const file of files) {
    const path = file.path.replace(/\\/g, "/");
    if (!SCANNED_FILE_RE.test(path)) continue;
    const content = file.content ?? "";
    if (!content.includes("/")) continue;

    const lines = content.split("\n");
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
      const line = lines[lineIdx]!;
      // Quick reject: lines without href/router/redirect can't possibly match.
      if (
        !line.includes("href") &&
        !line.includes("router.") &&
        !line.includes("redirect(") &&
        !line.includes("permanentRedirect(")
      ) {
        continue;
      }
      NAV_HREF_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = NAV_HREF_RE.exec(line)) !== null) {
        const raw = m.slice(1).find((v) => typeof v === "string" && v.length > 0);
        if (!raw) continue;
        if (shouldSkipHref(raw)) continue;
        // The capture for template-literal hrefs stops at the first ${ or `,
        // so the captured `raw` itself never contains ${. We detect "dynamic"
        // intent by checking the surrounding line for the matched substring
        // followed by `${` — a heuristic that handles `` href={`/blogg/${id}`} ``
        // without false-positiving on pure string literals.
        const matchEnd = m.index + m[0]!.length;
        const tail = line.slice(matchEnd, matchEnd + 2);
        const isDynamic = tail.startsWith("${") || tail.startsWith("/$");
        found.push({
          file: path,
          line: lineIdx + 1,
          raw,
          basePath: staticBaseOfHref(raw),
          isDynamic,
        });
      }
    }
  }
  return found;
}

/**
 * Pure Levenshtein with an early-exit cap. We only need to know whether the
 * distance is ≤ 2; anything larger is "no good suggestion".
 */
function levenshteinAtMost(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    let rowMin = curr[0]!;
    for (let j = 1; j <= n; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
      if (curr[j]! < rowMin) rowMin = curr[j]!;
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

/**
 * Suggest the closest known route to a basePath (Levenshtein ≤ 2). Returns
 * null when no candidate is close enough — we'd rather stay silent than
 * mislead the user (or the autofix LLM) with a bad guess.
 */
function suggestClosestRoute(basePath: string, knownRoutes: string[]): string | null {
  if (knownRoutes.length === 0) return null;
  let best: { route: string; dist: number } | null = null;
  for (const route of knownRoutes) {
    if (route === "/") continue; // root is rarely a useful suggestion
    const dist = levenshteinAtMost(basePath, route, 2);
    if (dist > 2) continue;
    if (!best || dist < best.dist) {
      best = { route, dist };
    }
  }
  return best?.route ?? null;
}

/**
 * Cross-check extracted hrefs against the project's actual route patterns.
 * Returns one mismatch per offending href occurrence (no per-file dedupe).
 *
 * Matching rules:
 *   - `actualRoutePaths` come from {@link extractAppRoutePathsFromFilePaths}
 *     and may contain both static (`/blogg`) and dynamic (`/blogg/[slug]`)
 *     segments.
 *   - A href's `basePath` is considered satisfied when ANY actual route's
 *     regex matches it. This handles `/blogg/foo` against `/blogg/[slug]`.
 *   - Hrefs that are pure dynamic prefixes (`/blogg`) match the static
 *     route literal directly.
 */
export function crossCheckHrefsAgainstRoutes(
  hrefs: ExtractedHref[],
  actualRoutePaths: string[],
): HrefRouteMismatch[] {
  if (hrefs.length === 0) return [];
  const normalizedRoutes = actualRoutePaths.map((path) => normalizeRoutePath(path));
  const matchers = normalizedRoutes.map(routePatternToRegex);
  const mismatches: HrefRouteMismatch[] = [];

  for (const href of hrefs) {
    const candidate = href.basePath;
    const matchesActual = matchers.some((re) => re.test(candidate));
    if (matchesActual) continue;

    // Template-literal hrefs (`` `/blogg/${id}` ``) are valid when ANY actual
    // dynamic route extends the basePath with at least one extra segment of
    // the form `[name]`, `[...name]` or `[[...name]]`. Pure static hrefs do
    // NOT get this concession — they must match exactly (the whole point is
    // to catch `/blog/${slug}` against actual `/blog/slug` literal routes).
    if (href.isDynamic) {
      const candSegments = candidate.split("/").filter(Boolean);
      const isDynamicPrefix = normalizedRoutes.some((route) => {
        const routeSegments = route.split("/").filter(Boolean);
        if (routeSegments.length <= candSegments.length) return false;
        for (let i = 0; i < candSegments.length; i += 1) {
          if (routeSegments[i] !== candSegments[i]) return false;
        }
        const next = routeSegments[candSegments.length]!;
        return next.startsWith("[") && next.endsWith("]");
      });
      if (isDynamicPrefix) continue;
    }

    mismatches.push({
      ...href,
      suggestion: suggestClosestRoute(candidate, normalizedRoutes),
    });
  }
  return mismatches;
}

/**
 * Format a single mismatch as a human-readable preflight message.
 * Used by `runFinalizePreflight` so error-log entries stay consistent.
 */
export function formatMismatchMessage(mismatch: HrefRouteMismatch): string {
  const base = `Internal href "${mismatch.raw}" at ${mismatch.file}:${mismatch.line} does not match any generated route.`;
  return mismatch.suggestion
    ? `${base} Did you mean "${mismatch.suggestion}"?`
    : base;
}
