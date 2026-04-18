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
 * Map page-file name → route path (mirror of {@link extractPreviewRoutesFromFileNames}
 * but for a single file). Returns null when the file isn't a page.
 */
export function routePathFromPageFileName(rawName: string): string | null {
  const name = rawName.replace(/\\/g, "/");
  const toPath = (segments: string[]): string | null => {
    const normalized = segments
      .filter(Boolean)
      .map((segment) => segment.trim())
      .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"));
    if (normalized.some((segment) => segment.includes("[") || segment.includes("]"))) return null;
    return normalized.length > 0 ? `/${normalized.join("/")}` : "/";
  };

  const appMatch = name.match(/^(?:src\/)?app\/(.+)$/);
  if (appMatch) {
    const relative = appMatch[1];
    if (relative !== "page.tsx" && !relative.endsWith("/page.tsx")) return null;
    const routeDir = relative.replace(/\/?page\.tsx$/, "");
    return toPath(routeDir ? routeDir.split("/") : []);
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
    return toPath(routePath ? routePath.split("/") : []);
  }

  return null;
}

export function extractPreviewRoutesFromFileNames(fileNames: string[]): string[] {
  const routes = new Set<string>();

  const pushRoute = (segments: string[]) => {
    const normalized = segments
      .filter(Boolean)
      .map((segment) => segment.trim())
      .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"));
    if (normalized.some((segment) => segment.includes("[") || segment.includes("]"))) return;
    routes.add(normalized.length > 0 ? `/${normalized.join("/")}` : "/");
  };

  for (const rawName of fileNames) {
    const name = rawName.replace(/\\/g, "/");

    const appMatch = name.match(/^(?:src\/)?app\/(.+)$/);
    if (appMatch) {
      const relative = appMatch[1];
      if (relative === "page.tsx" || relative.endsWith("/page.tsx")) {
        const routeDir = relative.replace(/\/?page\.tsx$/, "");
        pushRoute(routeDir ? routeDir.split("/") : []);
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
      pushRoute(routePath ? routePath.split("/") : []);
    }
  }

  const orderedRoutes = Array.from(routes).sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });
  return orderedRoutes;
}
