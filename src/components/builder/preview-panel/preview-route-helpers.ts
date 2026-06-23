/**
 * Pure URL/route helpers for the preview panel (client-only callers).
 *
 * Preview-host URLs follow the convention `/<chatId>/<appRoute>`.
 * Helpers must preserve the chatId prefix when navigating between routes
 * and strip it when detecting the active route for tab highlighting.
 */

export function buildOwnEngineRoutePreviewUrl(
  currentUrl: string,
  nextHref: string,
): string | null {
  const href = nextHref.trim();
  if (!href.startsWith("/")) return null;

  try {
    const url = new URL(currentUrl, window.location.origin);
    url.searchParams.set("route", href);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function buildExternalRoutePreviewUrl(
  currentUrl: string,
  nextHref: string,
): string | null {
  const href = nextHref.trim();
  if (!href.startsWith("/")) return null;

  try {
    const url = new URL(currentUrl, window.location.origin);
    const basePrefix = extractTier2BasePrefix(url.pathname);
    url.pathname = href === "/" ? basePrefix : `${basePrefix}${href}`;
    return currentUrl.startsWith("/") ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    return null;
  }
}

/**
 * Extract the app-level route from a tier-2 preview URL pathname.
 * For `/<chatId>/users` returns `/users`; for `/<chatId>` returns `/`.
 */
export function extractTier2AppRoute(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return "/";
  return `/${segments.slice(1).join("/")}`;
}

function extractTier2BasePrefix(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length > 0 ? `/${segments[0]}` : "";
}

/**
 * A single page route derived from the version's file set, enriched with
 * reachability + display metadata so the preview chrome can render an
 * accurate, navigable tab list (see `derivePreviewRoutes`).
 */
export interface PreviewRouteInfo {
  /** Canonical app route, e.g. "/", "/about", "/blog/[slug]". Used for nav. */
  route: string;
  /** Human label for the tab, e.g. "/", "/about", "/blog/:slug". */
  label: string;
  /** True when the route contains a dynamic segment (`[param]`). */
  dynamic: boolean;
  /** Whether the tab can be opened directly in the iframe (static only). */
  navigable: boolean;
  /**
   * Whether the route is linked from the site's nav (computed from a file
   * outside the route's own subtree). Orphan/unlinked page files have
   * `reachable: false` — the chrome still lists them (with an "unlinked" badge +
   * remove control) so a page added without an auto-linked nav entry stays
   * visible and orphan files can still be removed.
   */
  reachable: boolean;
}

type RawPageRoute = { route: string; dynamic: boolean };

function routeSegmentsFromAppRelative(relative: string): string[] | null {
  if (relative !== "page.tsx" && !relative.endsWith("/page.tsx")) return null;
  const routeDir = relative.replace(/\/?page\.tsx$/, "");
  return routeDir ? routeDir.split("/") : [];
}

function buildRouteFromSegments(segments: string[]): RawPageRoute | null {
  const normalized = segments
    .filter(Boolean)
    .map((segment) => segment.trim())
    // Route groups `(marketing)` and parallel/intercept slots `@modal` do not
    // contribute a URL segment in the Next App Router.
    .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"));
  const dynamic = normalized.some((segment) => segment.includes("[") || segment.includes("]"));
  return {
    route: normalized.length > 0 ? `/${normalized.join("/")}` : "/",
    dynamic,
  };
}

/**
 * Collect every page route (static AND dynamic) from a flat list of file
 * names. Unlike `extractPreviewRoutesFromFileNames` this keeps dynamic routes
 * so the chrome can show e.g. `/blog/:slug` (non-navigable) for an accurate
 * page count.
 */
export function collectPageRoutes(fileNames: string[]): RawPageRoute[] {
  const byRoute = new Map<string, RawPageRoute>();

  for (const rawName of fileNames) {
    const name = rawName.replace(/\\/g, "/");

    const appMatch = name.match(/^(?:src\/)?app\/(.+)$/);
    if (appMatch) {
      const segments = routeSegmentsFromAppRelative(appMatch[1]);
      if (segments) {
        const built = buildRouteFromSegments(segments);
        if (built) byRoute.set(built.route, built);
      }
      continue;
    }

    const pagesMatch = name.match(/^pages\/(.+)$/);
    if (pagesMatch) {
      const relative = pagesMatch[1];
      if (relative.startsWith("api/")) continue;
      if (!/\.(tsx|ts|jsx|js)$/.test(relative)) continue;
      const routeFile = relative.replace(/\.(tsx|ts|jsx|js)$/, "");
      const routePath = routeFile.endsWith("/index")
        ? routeFile.slice(0, -"/index".length)
        : routeFile === "index"
          ? ""
          : routeFile;
      const built = buildRouteFromSegments(routePath ? routePath.split("/") : []);
      if (built) byRoute.set(built.route, built);
    }
  }

  return Array.from(byRoute.values());
}

/**
 * The route subtree a source file belongs to, used to exclude a route's own
 * files when deciding whether something *else* links to it. Returns `null` for
 * shared files (site header, components, lib, config) that live outside the
 * route tree and therefore count as external link sources for every route.
 *
 * App Router: the directory that contains the file, so `app/blog/[slug]/page.tsx`
 * and a co-located `app/blog/[slug]/parts.tsx` both belong to `/blog/[slug]`.
 * Pages Router: the page's own route.
 */
function fileSubtreeRoute(rawName: string): string | null {
  const name = rawName.replace(/\\/g, "/");

  const appMatch = name.match(/^(?:src\/)?app\/(.+)$/);
  if (appMatch) {
    const segments = appMatch[1].split("/");
    // Drop the filename; the containing directory defines the subtree.
    segments.pop();
    return buildRouteFromSegments(segments)?.route ?? null;
  }

  const pagesMatch = name.match(/^pages\/(.+)$/);
  if (pagesMatch) {
    const relative = pagesMatch[1];
    if (relative.startsWith("api/")) return null;
    if (!/\.(tsx|ts|jsx|js)$/.test(relative)) return null;
    const routeFile = relative.replace(/\.(tsx|ts|jsx|js)$/, "");
    const routePath = routeFile.endsWith("/index")
      ? routeFile.slice(0, -"/index".length)
      : routeFile === "index"
        ? ""
        : routeFile;
    return buildRouteFromSegments(routePath ? routePath.split("/") : [])?.route ?? null;
  }

  return null;
}

/**
 * Whether a file belongs to the candidate route's own subtree (the route itself
 * or a descendant). Such files are excluded as link sources so an orphan page
 * cannot keep itself reachable via a self-link or page-local nav.
 */
function fileBelongsToRouteSubtree(subtreeRoute: string | null, route: string): boolean {
  if (subtreeRoute === null) return false;
  return subtreeRoute === route || subtreeRoute.startsWith(`${route}/`);
}

export function extractPreviewRoutesFromFileNames(fileNames: string[]): string[] {
  const routes = collectPageRoutes(fileNames)
    .filter((entry) => !entry.dynamic)
    .map((entry) => entry.route);

  return Array.from(new Set(routes)).sort(comparePreviewRoutes);
}

const ASSET_LINK_PATTERN =
  /\.(svg|png|jpe?g|gif|webp|avif|ico|css|js|mjs|cjs|json|txt|xml|map|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|wav|pdf)$/i;

/**
 * Normalize a raw quoted path literal found in source into a canonical internal
 * link path, or `null` when it is not a usable internal route reference.
 *
 * Template-literal interpolation (`/blog/${slug}`) collapses to the static
 * prefix WITH a trailing slash (`/blog/`) so callers can treat it as a
 * "something under /blog is linked" signal.
 */
export function normalizeLinkPath(raw: string): string | null {
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null; // protocol-relative / external
  // Strip query + hash.
  let path = raw.split("?")[0]!.split("#")[0]!;
  // Collapse template-literal interpolation to its static prefix.
  const interpolationIndex = path.indexOf("${");
  if (interpolationIndex !== -1) {
    path = path.slice(0, interpolationIndex);
    if (!path.endsWith("/")) path = `${path}/`;
  }
  if (path === "") return null;
  if (path === "/") return "/";
  if (path.startsWith("/api/") || path === "/api") return null;
  if (ASSET_LINK_PATTERN.test(path)) return null;
  // Trim a trailing slash unless it marks a template prefix where the segment
  // before it is meaningful (we keep `/blog/` to mean "child of /blog").
  return path;
}

/**
 * Collect the set of internal link paths referenced anywhere in the project
 * source. Used to decide which page routes are actually reachable.
 */
export function collectInternalLinkPaths(contents: string[]): Set<string> {
  const links = new Set<string>();
  const quoted = /["'`](\/[^"'`\s]*)["'`]/g;
  for (const content of contents) {
    if (!content) continue;
    let match: RegExpExecArray | null;
    quoted.lastIndex = 0;
    while ((match = quoted.exec(content)) !== null) {
      const normalized = normalizeLinkPath(match[1]!);
      if (normalized) links.add(normalized);
    }
  }
  return links;
}

function staticPrefixForRoute(route: string): string {
  const segments = route.split("/").filter(Boolean);
  const staticSegments: string[] = [];
  for (const segment of segments) {
    if (segment.includes("[")) break;
    staticSegments.push(segment);
  }
  return staticSegments.length > 0 ? `/${staticSegments.join("/")}` : "";
}

function trimTrailingSlash(path: string): string {
  return path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Whether a derived page route is reachable given the set of internal links.
 * Home (`/`) is always reachable. A static route is reachable when it is linked
 * directly or has a linked child. A dynamic route is reachable when something
 * under its static prefix is linked.
 */
export function isRouteReachable(
  route: RawPageRoute,
  linkPaths: Set<string>,
): boolean {
  if (route.route === "/") return true;

  const links = Array.from(linkPaths);

  if (!route.dynamic) {
    const target = route.route;
    return links.some((raw) => {
      const link = trimTrailingSlash(raw);
      return link === target || link.startsWith(`${target}/`);
    });
  }

  const prefix = staticPrefixForRoute(route.route);
  if (prefix === "") {
    // Root-level dynamic route (`/[slug]`): reachable when any single-segment
    // internal link exists.
    return links.some((raw) => /^\/[^/]+$/.test(trimTrailingSlash(raw)));
  }
  return links.some((raw) => {
    const link = trimTrailingSlash(raw);
    return link === prefix || link.startsWith(`${prefix}/`);
  });
}

function labelForRoute(route: string): string {
  return route.replace(/\[(?:\.\.\.)?([^\]]+)\]/g, ":$1");
}

function comparePreviewRoutes(a: string, b: string): number {
  if (a === "/") return -1;
  if (b === "/") return 1;
  const depthA = a.split("/").length;
  const depthB = b.split("/").length;
  if (depthA !== depthB) return depthA - depthB;
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

/**
 * Derive the page routes for the preview chrome from the version's files.
 *
 * Reachability (linked from a file *outside* the route's own subtree — a
 * self-link or copied page-local nav cannot make a route reachable) is computed
 * per route and exposed as the `reachable` flag instead of being used to drop
 * routes. The chrome lists reachable routes first (normal nav order) then
 * orphan/unlinked routes (with a badge + remove control), so a page added
 * without an auto-linked nav entry stays visible and orphan page files can still
 * be removed. Home (`/`) is always reachable; dynamic routes are non-navigable.
 */
export function derivePreviewRoutes(
  files: Array<{ name: string; content?: string | null }>,
): PreviewRouteInfo[] {
  const fileNames = files.map((file) => file.name);
  const rawRoutes = collectPageRoutes(fileNames);

  // Index each file by its own internal links + the route subtree it belongs to.
  // A candidate route is reachable only when linked from a file *outside* its own
  // subtree, so a self-link or copied page-local nav cannot keep an orphan alive.
  const indexedFiles = files.map((file) => ({
    subtreeRoute: fileSubtreeRoute(file.name),
    links: collectInternalLinkPaths([file.content ?? ""]),
  }));

  const withReachable = rawRoutes.map((route) => {
    if (route.route === "/") return { route, reachable: true };
    const externalLinks = new Set<string>();
    for (const file of indexedFiles) {
      if (fileBelongsToRouteSubtree(file.subtreeRoute, route.route)) continue;
      for (const link of file.links) externalLinks.add(link);
    }
    return { route, reachable: isRouteReachable(route, externalLinks) };
  });

  const byRouteOrder = (
    a: { route: RawPageRoute },
    b: { route: RawPageRoute },
  ): number => comparePreviewRoutes(a.route.route, b.route.route);

  // Reachable (linked) routes first in nav order, then orphan/unlinked routes.
  const ordered = [
    ...withReachable.filter((entry) => entry.reachable).sort(byRouteOrder),
    ...withReachable.filter((entry) => !entry.reachable).sort(byRouteOrder),
  ];

  return ordered.map(({ route, reachable }) => ({
    route: route.route,
    label: labelForRoute(route.route),
    dynamic: route.dynamic,
    navigable: !route.dynamic,
    reachable,
  }));
}
