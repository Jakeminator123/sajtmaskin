import { normalizeRoutePath } from "./path-utils";

export function routePatternToRegex(route: string): RegExp {
  const cleaned = normalizeRoutePath(route);
  if (cleaned === "/") return /^\/$/;
  const segments = cleaned.split("/").filter(Boolean);
  let pattern = "^";
  for (const segment of segments) {
    if (segment.startsWith("[[...") && segment.endsWith("]]")) {
      pattern += "(?:/.*)?";
      break;
    }
    if (segment.startsWith("[...") && segment.endsWith("]")) {
      pattern += "/.+";
      continue;
    }
    if (segment.startsWith("[") && segment.endsWith("]")) {
      pattern += "/[^/]+";
      continue;
    }
    const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern += `/${escaped}`;
  }
  pattern += "$";
  return new RegExp(pattern);
}

function dynamicPrefixCoversPath(actualRoute: string, plannedPath: string): boolean {
  const actual = normalizeRoutePath(actualRoute);
  const planned = normalizeRoutePath(plannedPath);
  if (actual === planned) return true;

  const segments = actual.split("/").filter(Boolean);
  const firstDynamicIndex = segments.findIndex(
    (segment) =>
      (segment.startsWith("[") && segment.endsWith("]")) ||
      (segment.startsWith("[...") && segment.endsWith("]")) ||
      (segment.startsWith("[[...") && segment.endsWith("]]")),
  );
  if (firstDynamicIndex < 0) return false;

  const prefixSegments = segments.slice(0, firstDynamicIndex);
  const prefixPath = prefixSegments.length > 0 ? `/${prefixSegments.join("/")}` : "/";
  return planned === prefixPath;
}

export function findMissingRequiredRoutes<T extends { path: string; required: boolean }>(
  plannedRoutes: T[],
  actualRoutes: string[],
): T[] {
  if (plannedRoutes.length === 0) return [];
  const normalizedActualRoutes = actualRoutes.map((route) => normalizeRoutePath(route));
  const matchers = normalizedActualRoutes.map(routePatternToRegex);
  return plannedRoutes.filter((route) => {
    if (!route.required) return false;
    const plannedPath = normalizeRoutePath(route.path);
    return !matchers.some((matcher, index) => {
      if (matcher.test(plannedPath)) return true;
      return dynamicPrefixCoversPath(normalizedActualRoutes[index]!, plannedPath);
    });
  });
}
