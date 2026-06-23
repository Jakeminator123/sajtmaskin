/**
 * Pure helpers for the preview panel "+/-" page management (no IO, no LLM).
 *
 * These turn a user intent ("add a page at /about", "remove /blog") plus the
 * current version file set into a deterministic list of quick-edit ops. The
 * ops are applied by the Fast Edit Lane (`runQuickEdit`) which persists a new
 * minor version and re-bootstraps the live preview.
 *
 * Nav-link insertion/removal is best-effort: it covers the two common shapes
 * generated sites use (a `navItems`-style data array of `{ label, href }`
 * objects, and literal `<Link href="…">…</Link>` / `<a href="…">…</a>`
 * elements). When no nav can be located the page file is still created/deleted;
 * the caller surfaces a hint so the user can wire the link via chat.
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

/**
 * Remove every internal link to `route` from a single file's content.
 * Handles JSX `<Link>`/`<a>` elements and `{ …, href: "…", … }` data entries.
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

  // 2) Paired JSX elements: <Link href="/route" …>…</Link> and <a …>…</a>
  const pairedLink = new RegExp(
    `<(Link|a)\\b[^>]*?href=\\{?${href}\\}?[^>]*?>[\\s\\S]*?<\\/\\1>\\s*`,
    "g",
  );
  next = next.replace(pairedLink, "");

  // 3) Self-closing JSX elements: <Link href="/route" … />
  const selfClosing = new RegExp(
    `<(Link|a)\\b[^>]*?href=\\{?${href}\\}?[^>]*?/>\\s*`,
    "g",
  );
  next = next.replace(selfClosing, "");

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

/** Try to insert a sibling `<Link>`/`<a>` after the last literal internal link. */
function insertJsxNavLink(content: string, route: string, label: string): string | null {
  const linkRe = /<(Link|a)\b[^>]*?href=\{?["'`]\/[^"'`]*["'`]\}?[^>]*?>[\s\S]*?<\/\1>/g;
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(content)) !== null) {
    last = match;
  }
  if (!last) return null;
  const element = last[0];
  if (element.includes(`href="${route}"`) || element.includes(`href='${route}'`)) {
    return null;
  }
  const tag = last[1];
  const newElement = `<${tag} href="${route}">${label}</${tag}>`;
  const insertAt = (last.index ?? 0) + element.length;
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
