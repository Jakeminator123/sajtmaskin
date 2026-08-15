export function normalizeRoutePath(value: string): string {
  if (!value) return "/";
  const trimmed = value.trim();
  if (trimmed === "/") return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalizedSegments = withLeadingSlash
    .replace(/\/{2,}/g, "/")
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;
      const paramName = segment.slice(1).trim();
      return paramName ? `[${paramName}]` : segment;
    })
    .join("/");
  return normalizedSegments.replace(/\/$/, "") || "/";
}

export function extractAppRoutePathsFromFilePaths(filePaths: string[]): string[] {
  const routes = new Set<string>();
  for (const rawFilePath of filePaths) {
    const rawName = rawFilePath.replace(/^\/+/, "");
    if (/^page\.(t|j)sx?$/.test(rawName)) {
      routes.add("/");
      continue;
    }
    let rest: string | null = null;
    if (rawName.startsWith("src/app/")) rest = rawName.slice("src/app/".length);
    if (rawName.startsWith("app/")) rest = rawName.slice("app/".length);
    if (!rest) continue;
    if (!/page\.(t|j)sx?$/.test(rest)) continue;
    const parts = rest.split("/");
    parts.pop();
    const segments = parts
      .filter(Boolean)
      .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
      .filter((segment) => !segment.startsWith("@"));
    const route = `/${segments.join("/")}`;
    routes.add(route === "/" ? "/" : route.replace(/\/+$/, ""));
  }
  return Array.from(routes);
}

/**
 * Route-plan depth (ägarbeslut 2026-08-14). Only level 1 and 2 count
 * against the per-round page ceiling; level 3 is owned by the scaffold
 * `routeContract` (dynamic templates), not by the cap.
 *
 * - Level 1: `/`
 * - Level 2: one static segment (`/om-oss`, `/kontakt`, `/projekt`)
 * - Level 3: deeper or dynamic (`/blog/[slug]`, `/product/[id]`)
 */
export function getRoutePlanDepth(path: string): 1 | 2 | 3 {
  const normalized = normalizeRoutePath(path);
  if (normalized === "/") return 1;
  const segments = normalized.split("/").filter(Boolean);
  const dynamic = segments.some(
    (segment) => segment.startsWith("[") && segment.endsWith("]"),
  );
  if (segments.length >= 2 || dynamic) return 3;
  return 2;
}

export function countsTowardPageCeiling(path: string): boolean {
  return getRoutePlanDepth(path) <= 2;
}
