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

/** Whether a page file already exists for `route` under EITHER app prefix. */
export function routeHasPageFile(files: PageFileShape[], route: string): boolean {
  const segments = routeSegments(route);
  if (segments.length === 0) return files.some((f) => /^(?:src\/)?app\/page\.tsx$/.test(normalizeName(f.name)));
  const joined = segments.join("/");
  return files.some((f) => {
    const name = normalizeName(f.name);
    return name === `app/${joined}/page.tsx` || name === `src/app/${joined}/page.tsx`;
  });
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
 */
export function findRouteFilePaths(files: PageFileShape[], route: string): string[] {
  const segments = routeSegments(route);
  if (segments.length === 0) return []; // never collect the home subtree
  const appDir = `app/${segments.join("/")}`;
  const srcAppDir = `src/app/${segments.join("/")}`;
  const matched: string[] = [];
  for (const file of files) {
    const name = normalizeName(file.name);
    if (
      name === `${appDir}/page.tsx` ||
      name === `${srcAppDir}/page.tsx` ||
      name.startsWith(`${appDir}/`) ||
      name.startsWith(`${srcAppDir}/`)
    ) {
      matched.push(file.name);
    }
  }
  return matched;
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
 * Remove every internal link to `route` from a single file's content.
 * Handles JSX `<Link>`/`<a>` elements and `{ …, href: "…", … }` data entries.
 * Returns the (possibly unchanged) content.
 */
export function stripRouteFromContent(content: string, route: string): string {
  if (!content) return content;
  const r = escapeRegExp(route);
  let next = content;

  // 1) Data-array object entries: { label: "…", href: "/route" }, (any key order)
  const objectEntry = new RegExp(
    `\\{[^{}]*?href:\\s*["'\`]${r}["'\`][^{}]*?\\}\\s*,?`,
    "g",
  );
  next = next.replace(objectEntry, "");

  // 2) Paired JSX elements: <Link href="/route" …>…</Link> and <a …>…</a>
  const pairedLink = new RegExp(
    `<(Link|a)\\b[^>]*?href=\\{?["'\`]${r}["'\`]\\}?[^>]*?>[\\s\\S]*?<\\/\\1>\\s*`,
    "g",
  );
  next = next.replace(pairedLink, "");

  // 3) Self-closing JSX elements: <Link href="/route" … />
  const selfClosing = new RegExp(
    `<(Link|a)\\b[^>]*?href=\\{?["'\`]${r}["'\`]\\}?[^>]*?/>\\s*`,
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
  // Find a representative existing entry with an internal href.
  const entryMatch = content.match(
    /\{[^{}]*?href:\s*["'`]\/[^"'`]*["'`][^{}]*?\}/,
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
