/**
 * Pure URL/route helpers for the preview panel (client-only callers).
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
    url.pathname = href;
    return currentUrl.startsWith("/") ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    return null;
  }
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
