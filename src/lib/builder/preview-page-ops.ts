/**
 * Pure helpers for the preview panel "+/-" page management (no IO, no LLM).
 *
 * Contract (keep in sync with `PreviewPanel` + `PreviewPanelChrome`):
 *
 * - **Add page (`+`)** always creates `app/<route>/page.tsx` (or `src/app/…`) via
 *   `buildNewPageContent` — a blank starter the user fills via chat.
 * - **Remove page (`−`)** deletes the route subtree (`findRouteFilePaths`) and
 *   best-effort strips nav links to that route.
 * - **Nav wiring is best-effort, never crashy:** we mutate nav arrays or JSX only
 *   when the result stays valid. Radix/shadcn `<Button asChild>` / `Slot` wrappers
 *   require EXACTLY ONE child — a sibling inserted inside one, or a link deleted
 *   out of one, crashes the preview at runtime with "Slot failed to slot onto its
 *   children" (500/black screen). So inserts go AFTER the wrapper and removals
 *   take the WHOLE wrapper (see `asChildWrapperRange`). When no nav can be
 *   updated the page is still created and shown as **olänkad** (amber chip in
 *   the route strip) for chat follow-up — `navUpdated: false`, never a crash.
 * - Ops are applied by Fast Edit Lane (`runQuickEdit`) → new minor version + preview
 *   re-bootstrap. Do not route page create/delete through the LLM pipeline.
 */
import type { QuickEditClientOp } from "@/lib/builder/engine-files-patch";

export interface PageFileShape {
  name: string;
  content?: string | null;
}

const RESERVED_FIRST_SEGMENTS = new Set(["api", "_next", "favicon.ico"]);

/** Normalize freeform user input into a canonical app route, or null if invalid. */
export function normalizePageRouteInput(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // No dynamic-segment creation through the "+" button — reject before
  // slugification strips the brackets.
  if (/[[\]]/.test(trimmed)) return null;

  const segments = trimmed
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) =>
      segment
        .trim()
        .toLowerCase()
        .replace(/[åä]/g, "a")
        .replace(/ö/g, "o")
        .replace(/[éèê]/g, "e")
        .replace(/ü/g, "u")
        .replace(/[^a-z0-9\-_]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean);

  if (segments.length === 0) return null;
  // No dynamic-segment creation through the "+" button.
  if (segments.some((segment) => segment.includes("[") || segment.includes("]"))) return null;
  if (RESERVED_FIRST_SEGMENTS.has(segments[0]!)) return null;

  return `/${segments.join("/")}`;
}

export type AppDirPrefix = "app" | "src/app";

function routeSegments(route: string): string[] {
  return route.split("/").filter(Boolean);
}

/**
 * Detect whether a project is `app/`- or `src/app/`-rooted from its files.
 * The pipeline emits either layout; add-page must write into the SAME tree the
 * live site serves, otherwise Next mounts a second (unserved) router tree.
 */
export function detectAppDir(files: PageFileShape[]): AppDirPrefix {
  let hasApp = false;
  let hasSrcApp = false;
  for (const file of files) {
    const name = normalizeName(file.name);
    if (name.startsWith("src/app/")) hasSrcApp = true;
    else if (name.startsWith("app/")) hasApp = true;
  }
  if (hasSrcApp && !hasApp) return "src/app";
  return "app";
}

/** App-router directory for a route, e.g. "/about" → "app/about", "/" → "app". */
export function routeDirForRoute(route: string, appDir: AppDirPrefix = "app"): string {
  const segments = routeSegments(route);
  return segments.length > 0 ? `${appDir}/${segments.join("/")}` : appDir;
}

/** Page file path for a route, e.g. "/about" → "app/about/page.tsx". */
export function pageFilePathForRoute(route: string, appDir: AppDirPrefix = "app"): string {
  const dir = routeDirForRoute(route, appDir);
  return `${dir}/page.tsx`;
}

/**
 * Canonical route derivation, intentionally DUPLICATED from
 * `preview-panel/preview-route-helpers.ts` (`collectPageRoutes` /
 * `buildRouteFromSegments`). This module lives under `src/lib` and must not
 * import from `src/components`, so the App Router rules are mirrored here: strip
 * `(group)` and `@slot` segments (they contribute no URL segment), support both
 * `app/` and `src/app/`, and resolve Pages Router files (`index` → parent,
 * `api/*` ignored). Keep the two in sync when the route model changes.
 */
function canonicalRouteFromSegments(segments: string[]): string {
  const normalized = segments
    .filter(Boolean)
    .map((segment) => segment.trim())
    .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"));
  return normalized.length > 0 ? `/${normalized.join("/")}` : "/";
}

/** Canonical app route for a single file, or null when it is not a page file. */
function fileNameToRoute(rawName: string): string | null {
  const name = normalizeName(rawName);

  const appMatch = name.match(/^(?:src\/)?app\/(.+)$/);
  if (appMatch) {
    const relative = appMatch[1]!;
    if (relative !== "page.tsx" && !relative.endsWith("/page.tsx")) return null;
    const routeDir = relative.replace(/\/?page\.tsx$/, "");
    return canonicalRouteFromSegments(routeDir ? routeDir.split("/") : []);
  }

  const pagesMatch = name.match(/^pages\/(.+)$/);
  if (pagesMatch) {
    const relative = pagesMatch[1]!;
    if (relative.startsWith("api/")) return null;
    if (!/\.(tsx|ts|jsx|js)$/.test(relative)) return null;
    const routeFile = relative.replace(/\.(tsx|ts|jsx|js)$/, "");
    const routePath = routeFile.endsWith("/index")
      ? routeFile.slice(0, -"/index".length)
      : routeFile === "index"
        ? ""
        : routeFile;
    return canonicalRouteFromSegments(routePath ? routePath.split("/") : []);
  }

  return null;
}

/**
 * Physical directory whose subtree should be removed for a page file, or null
 * when it is not a page file. App Router → the on-disk directory holding
 * `page.tsx` (route groups/slots kept, since they exist on disk). Pages Router →
 * the route's directory (`pages/about.tsx` and `pages/about/index.tsx` both map
 * to `pages/about`), so nested descendants under it are swept too.
 */
function routeDirForFile(rawName: string): string | null {
  const name = normalizeName(rawName);

  const appMatch = name.match(/^(?:src\/)?app\/(.+)$/);
  if (appMatch) {
    const relative = appMatch[1]!;
    if (relative !== "page.tsx" && !relative.endsWith("/page.tsx")) return null;
    const slash = name.lastIndexOf("/");
    return slash >= 0 ? name.slice(0, slash) : null;
  }

  const pagesMatch = name.match(/^pages\/(.+)$/);
  if (pagesMatch) {
    const relative = pagesMatch[1]!;
    if (relative.startsWith("api/")) return null;
    if (!/\.(tsx|ts|jsx|js)$/.test(relative)) return null;
    const withoutExt = name.replace(/\.(tsx|ts|jsx|js)$/, "");
    return withoutExt.endsWith("/index")
      ? withoutExt.slice(0, -"/index".length)
      : withoutExt;
  }

  return null;
}

/**
 * Whether a page file already exists for `route` under EITHER app prefix.
 * Route-aware: a grouped path like `app/(marketing)/about/page.tsx` resolves to
 * `/about`, so adding `/about` is correctly rejected as a duplicate instead of
 * creating a second conflicting route. Pages Router (`pages/about.tsx`) and
 * `src/app` groups are covered too.
 */
export function routeHasPageFile(files: PageFileShape[], route: string): boolean {
  return files.some((file) => fileNameToRoute(file.name) === route);
}

/** A human label for a generated page, e.g. "/about/team" → "Team". */
export function defaultLabelForRoute(route: string): string {
  const segments = routeSegments(route);
  const last = segments[segments.length - 1] ?? "";
  if (!last) return "Hem";
  return last
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeName(name: string): string {
  return name.replace(/\\/g, "/");
}

/**
 * Every file path that belongs to a route's subtree (the route's own page plus
 * any nested route files/components colocated under it). Used by "−" so that
 * removing `/blog` also drops `/blog/[slug]`.
 *
 * Route-aware: it first finds the page file(s) whose CANONICAL route equals
 * `route` (so a grouped `app/(marketing)/about/page.tsx` resolves for `/about`)
 * then returns everything under each page file's PHYSICAL directory (colocated
 * components and nested descendants like `.../about/team/page.tsx`). When
 * several grouped page files map to the same route, all of their subtrees are
 * returned (deterministically sorted). The home (`/`) subtree is never
 * collected.
 */
export function findRouteFilePaths(files: PageFileShape[], route: string): string[] {
  if (routeSegments(route).length === 0) return []; // never collect the home subtree

  const pageFiles = files.filter((file) => fileNameToRoute(file.name) === route);
  if (pageFiles.length === 0) return [];

  const matched = new Set<string>();
  for (const pageFile of pageFiles) {
    matched.add(pageFile.name); // a Pages Router file sits beside, not under, its dir
    const dir = routeDirForFile(pageFile.name);
    if (!dir) continue;
    const prefix = `${dir}/`;
    for (const file of files) {
      if (normalizeName(file.name).startsWith(prefix)) matched.add(file.name);
    }
  }
  return Array.from(matched).sort();
}

/** Minimal, brand-neutral starter page using the scaffold design tokens. */
export function buildNewPageContent(route: string, label: string): string {
  const safeLabel = label.replace(/[`$\\]/g, "");
  return `import Link from "next/link";

export default function Page() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground">
        ${safeLabel}
      </h1>
      <p className="text-base text-muted-foreground">
        Den här sidan (<code>${route}</code>) är ny. Beskriv i chatten vad den ska
        innehålla så fyller vi den med riktigt innehåll.
      </p>
      <Link
        href="/"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        ← Till startsidan
      </Link>
    </main>
  );
}
`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Regex source for a quoted href value equal to `route`, tolerating the same
 * normalizations the route tabs apply: an optional trailing slash, a query
 * (`?…`) or a hash (`#…`). The char right after the route must be the closing
 * quote, `/`, `?` or `#`, so `/blog` never matches a longer sibling such as
 * `/blogger` or `/blog/sub`. `escapedRoute` must already be regex-escaped.
 */
function hrefValuePattern(escapedRoute: string): string {
  return `["'\`]${escapedRoute}/?(?:[?#][^"'\`]*)?["'\`]`;
}

type JsxLinkMatch = { tag: string; element: string; start: number; end: number };

/**
 * All literal internal `<Link>`/`<a>` elements in `content`, with positions.
 * The `(?<!/)>` guard keeps the open-tag match from swallowing a self-closing
 * `<Link … />` and spanning to some LATER `</Link>` (which would mis-anchor
 * inserts and removals).
 */
function collectJsxInternalLinks(content: string): JsxLinkMatch[] {
  const re = /<(Link|a)\b[^>]*?href=\{?["'`]\/[^"'`]*["'`]\}?[^>]*?(?<!\/)>[\s\S]*?<\/\1>/g;
  const links: JsxLinkMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    links.push({
      tag: match[1]!,
      element: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return links;
}

/**
 * Radix `Slot` (shadcn `asChild`) requires EXACTLY ONE child element. If a link
 * at `start..end` is the sole child of an `asChild` wrapper (e.g.
 * `<Button asChild><Link …>…</Link></Button>`), returns the full wrapper range;
 * otherwise null. Deleting only the link, or inserting a sibling next to it,
 * crashes the preview at runtime with "Slot failed to slot onto its children"
 * — callers must operate on the wrapper range instead.
 */
function asChildWrapperRange(
  content: string,
  start: number,
  end: number,
): { start: number; end: number } | null {
  const before = content.slice(0, start);
  const openRe = /<(\w+)\b[^>]*\basChild\b[^>]*>/g;
  let open: RegExpExecArray | null;
  let wrapper: { tag: string; start: number } | null = null;
  while ((open = openRe.exec(before)) !== null) {
    const openEnd = open.index + open[0].length;
    // Only whitespace between the wrapper's opening tag and the link ⇒ the
    // link is its first (and, checked below, only) child.
    if (/^\s*$/.test(content.slice(openEnd, start))) {
      wrapper = { tag: open[1]!, start: open.index };
    }
  }
  if (!wrapper) return null;
  const closeMatch = content.slice(end).match(new RegExp(`^\\s*</${wrapper.tag}>`));
  if (!closeMatch) return null;
  return { start: wrapper.start, end: end + closeMatch[0].length };
}

/**
 * Remove ranges from `content`, back to front so indices stay valid.
 * Overlapping/nested ranges are merged first — several regex passes (and
 * asChild wrapper expansion) can target the same region, and applying a stale
 * overlapping range after a larger removal would delete unrelated markup.
 */
function removeRanges(content: string, ranges: Array<{ start: number; end: number }>): string {
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  let next = content;
  for (const { start, end } of merged.reverse()) {
    // Also swallow trailing whitespace up to and including one newline.
    const tail = next.slice(end).match(/^[ \t]*\r?\n?/);
    next = next.slice(0, start) + next.slice(end + (tail ? tail[0].length : 0));
  }
  return next;
}

/**
 * Remove every internal link to `route` from a single file's content.
 * Handles JSX `<Link>`/`<a>` elements and `{ …, href: "…", … }` data entries.
 * A link that is the sole child of an `asChild`/Slot wrapper is removed
 * TOGETHER WITH its wrapper (leaving an empty Slot crashes the preview).
 * Returns the (possibly unchanged) content.
 */
export function stripRouteFromContent(content: string, route: string): string {
  if (!content) return content;
  const href = hrefValuePattern(escapeRegExp(route));
  let next = content;

  // 1) Data-array object entries: { label: "…", href: "/route" } (any key
  //    order). Only ARRAY elements are removed — the object must be preceded by
  //    `[`/`,` and followed by `,`/`]`. A standalone `const cta = { href:
  //    "/route" }` is left intact (deleting its body would leave invalid JS like
  //    `const cta = ;`); the page file that owns the route is removed elsewhere.
  const objectEntry = new RegExp(
    `(?<=[\\[,]\\s*)\\{[^{}]*?href:\\s*${href}[^{}]*?\\}(?=\\s*[,\\]])`,
    "g",
  );
  next = next.replace(objectEntry, "");

  // 2) JSX elements linking to the route — paired and self-closing. Expand each
  //    hit to its asChild wrapper when the link is the wrapper's sole child.
  //    The paired pattern's `(?<!/)>` guard keeps it from starting at a
  //    self-closing `<Link … />` and spanning to a LATER `</Link>` (which would
  //    sweep unrelated siblings into the removal range).
  const jsxLinkRes = [
    new RegExp(`<(Link|a)\\b[^>]*?href=\\{?${href}\\}?[^>]*?(?<!/)>[\\s\\S]*?<\\/\\1>`, "g"),
    new RegExp(`<(Link|a)\\b[^>]*?href=\\{?${href}\\}?[^>]*?/>`, "g"),
  ];
  const removals: Array<{ start: number; end: number }> = [];
  for (const re of jsxLinkRes) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(next)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      removals.push(asChildWrapperRange(next, start, end) ?? { start, end });
    }
  }
  next = removeRanges(next, removals);

  // Collapse any dangling double commas / leading comma left in arrays.
  next = next.replace(/,(\s*,)+/g, ",").replace(/\[\s*,/g, "[").replace(/,(\s*])/g, "$1");

  return next;
}

/** Quick-edit ops that strip nav links to `route` from any file that has them. */
export function buildRemoveNavLinkOps(
  files: PageFileShape[],
  route: string,
): QuickEditClientOp[] {
  const ops: QuickEditClientOp[] = [];
  for (const file of files) {
    const content = file.content ?? "";
    if (!content || !content.includes(route)) continue;
    const stripped = stripRouteFromContent(content, route);
    if (stripped !== content) {
      ops.push({ kind: "replace_content", path: normalizeName(file.name), content: stripped });
    }
  }
  return ops;
}

function countInternalLinks(content: string): number {
  const matches = content.match(/href[=:]\s*\{?["'`]\/[^"'`]*["'`]/g);
  return matches ? matches.length : 0;
}

function looksLikeNavFile(name: string): boolean {
  return /(header|nav|navbar|navigation|footer|menu|sidebar)/i.test(name);
}

/** Try to insert a new entry into a `{ …, href }` data array. */
function insertDataNavEntry(content: string, route: string, label: string): string | null {
  // Find a representative existing entry with an internal href that is an ARRAY
  // element (preceded by `[`/`,`, followed by `,`/`]`). Appending `, {…}` after
  // a standalone `const cta = {…}` object would produce invalid JS, so a file
  // whose only nav-shaped object is standalone yields null here and the caller
  // falls back to JSX insertion (or reports no nav).
  const entryMatch = content.match(
    /(?<=[\[,]\s*)\{[^{}]*?href:\s*["'`]\/[^"'`]*["'`][^{}]*?\}(?=\s*[,\]])/,
  );
  if (!entryMatch) return null;
  const template = entryMatch[0];
  if (template.includes(`href: "${route}"`) || template.includes(`href: '${route}'`)) {
    return null; // already present
  }

  // Detect the label-style key used in the template (first non-href string key).
  const labelKeyMatch = template.match(/(\w+):\s*["'`][^"'`]*["'`]/g) ?? [];
  let labelKey = "label";
  for (const raw of labelKeyMatch) {
    const key = raw.split(":")[0]!.trim();
    if (key !== "href") {
      labelKey = key;
      break;
    }
  }

  const newEntry = `{ ${labelKey}: "${label}", href: "${route}" }`;
  const insertAt = (entryMatch.index ?? 0) + template.length;
  const before = content.slice(0, insertAt);
  const after = content.slice(insertAt);
  const separator = after.trimStart().startsWith(",") ? " " : ", ";
  return `${before}${separator}${newEntry}${after}`;
}

/**
 * End index (just past `</tag>`) of the element opened at `openEnd` for `tag`,
 * balancing nested same-tag elements and ignoring self-closing ones. Null when
 * no matching close is found.
 */
function matchingCloseEnd(content: string, tag: string, openEnd: number): number | null {
  const re = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, "g");
  re.lastIndex = openEnd;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return match.index + match[0].length;
    } else if (match[1] !== "/") {
      depth += 1; // nested non-self-closing open of the same tag
    }
  }
  return null;
}

/**
 * Range of the OUTERMOST `asChild`/Slot wrapper that encloses `start..end`
 * (walking through nested `asChild` wrappers), or null when the range is not
 * inside any. Unlike `asChildWrapperRange` this does NOT require the range to be
 * the wrapper's sole child — a link with siblings inside a Slot still counts.
 * Insertion must land AFTER this range so the new element becomes a sibling of
 * the whole wrapper chain instead of a second child of a Slot.
 */
function outermostAsChildWrapperEnd(content: string, start: number, end: number): number | null {
  let curStart = start;
  let curEnd = end;
  let outer: number | null = null;
  for (let guard = 0; guard < 32; guard += 1) {
    const before = content.slice(0, curStart);
    const openRe = /<(\w+)\b[^>]*\basChild\b[^>]*>/g;
    let open: RegExpExecArray | null;
    let nearest: { start: number; end: number } | null = null;
    while ((open = openRe.exec(before)) !== null) {
      const tag = open[1]!;
      const openEnd = open.index + open[0].length;
      const closeEnd = matchingCloseEnd(content, tag, openEnd);
      if (closeEnd !== null && closeEnd >= curEnd) {
        nearest = { start: open.index, end: closeEnd }; // keep the closest (largest index)
      }
    }
    if (!nearest) break;
    outer = nearest.end;
    curStart = nearest.start;
    curEnd = nearest.end;
  }
  return outer;
}

/**
 * Insert a sibling `<Link>`/`<a>` after the last literal internal link.
 * `asChild`/Slot-safe: if the anchor link sits inside one or more `asChild`
 * wrappers (with or without siblings), the new element is inserted AFTER the
 * outermost wrapper so it becomes a sibling of the wrapper chain. Inserting
 * inside a Slot would give it a second child and crash the preview at runtime.
 */
function insertJsxNavLink(content: string, route: string, label: string): string | null {
  const links = collectJsxInternalLinks(content);
  const last = links[links.length - 1];
  if (!last) return null;
  if (
    last.element.includes(`href="${route}"`) ||
    last.element.includes(`href='${route}'`)
  ) {
    return null;
  }
  const newElement = `<${last.tag} href="${route}">${label}</${last.tag}>`;
  const wrapperEnd = outermostAsChildWrapperEnd(content, last.start, last.end);
  const insertAt = wrapperEnd ?? last.end;
  return `${content.slice(0, insertAt)}\n      ${newElement}${content.slice(insertAt)}`;
}

export interface AddNavLinkResult {
  ops: QuickEditClientOp[];
  navUpdated: boolean;
}

/**
 * Quick-edit ops that add a nav link to `route` into the most likely navigation
 * file. `navUpdated` is false when no suitable nav was found (the page is still
 * created by the caller; the link must be added another way).
 */
export function buildAddNavLinkOps(
  files: PageFileShape[],
  route: string,
  label: string,
): AddNavLinkResult {
  const candidates = files
    .map((file) => ({ file, content: file.content ?? "" }))
    .filter(({ content }) => countInternalLinks(content) > 0)
    .sort((a, b) => {
      const navA = looksLikeNavFile(a.file.name) ? 1 : 0;
      const navB = looksLikeNavFile(b.file.name) ? 1 : 0;
      if (navA !== navB) return navB - navA;
      return countInternalLinks(b.content) - countInternalLinks(a.content);
    });

  for (const { file, content } of candidates) {
    const viaData = insertDataNavEntry(content, route, label);
    if (viaData && viaData !== content) {
      return {
        ops: [{ kind: "replace_content", path: normalizeName(file.name), content: viaData }],
        navUpdated: true,
      };
    }
    const viaJsx = insertJsxNavLink(content, route, label);
    if (viaJsx && viaJsx !== content) {
      return {
        ops: [{ kind: "replace_content", path: normalizeName(file.name), content: viaJsx }],
        navUpdated: true,
      };
    }
  }

  return { ops: [], navUpdated: false };
}
