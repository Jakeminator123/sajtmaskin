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
