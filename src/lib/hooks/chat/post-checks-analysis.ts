import type { PreviewPreflightState } from "@/lib/gen/preview-diagnostics";
import {
  runProjectSanityChecks,
  type SanityIssue,
  type SanityResult,
} from "@/lib/gen/validation/project-sanity";
import { DESIGN_TOKEN_FILES } from "./constants";
import { diffFiles, type FileDiff } from "./post-checks-diff";
import { getPreviewBlockingReason } from "./post-checks-preview";
import type { DesignTokenSummary, FileEntry, VersionEntry } from "./types";

export type SuspiciousUseCall = {
  file: string;
  line: number;
  snippet: string;
};

export type SeoIssue = {
  severity: "warning" | "error";
  code:
    | "missing-metadata"
    | "missing-title"
    | "missing-description"
    | "missing-open-graph"
    | "missing-twitter"
    | "missing-robots"
    | "missing-sitemap"
    | "missing-json-ld"
    | "missing-h1"
    | "multiple-h1";
  message: string;
  file?: string | null;
};

export type SeoReview = {
  passed: boolean;
  issues: SeoIssue[];
  signals: {
    metadata: boolean;
    title: boolean;
    description: boolean;
    openGraph: boolean;
    twitter: boolean;
    robots: boolean;
    sitemap: boolean;
    jsonLd: boolean;
    homeH1Count: number | null;
  };
};

export type PostCheckBaseline = {
  previousVersionId: string | null;
  changes: FileDiff | null;
  warnings: string[];
  missingRoutes: string[];
  lucideLinkMisuse: string[];
  suspiciousUseCalls: SuspiciousUseCall[];
  designTokens: DesignTokenSummary | null;
  seoReview: SeoReview;
  sanity: SanityResult;
  sanityIssues: SanityIssue[];
  sanityErrors: SanityIssue[];
  sanityWarnings: SanityIssue[];
  resolvedDemoUrl: string | null;
  previewBlockingReason: string | null;
};

export function inferLanguage(fileName: string): string {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".tsx")) return "tsx";
  if (normalized.endsWith(".ts")) return "ts";
  if (normalized.endsWith(".jsx")) return "jsx";
  if (normalized.endsWith(".js")) return "js";
  if (normalized.endsWith(".css")) return "css";
  if (normalized.endsWith(".json")) return "json";
  return "text";
}

export function extractDesignTokens(files: FileEntry[]): DesignTokenSummary | null {
  const candidate = files.find((file) =>
    DESIGN_TOKEN_FILES.some((path) => file.name.endsWith(path)),
  );
  if (!candidate?.content) return null;

  const tokens: Array<{ name: string; value: string }> = [];
  const regex = /--([a-zA-Z0-9-_]+)\s*:\s*([^;\n]+);/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(candidate.content)) && tokens.length < 24) {
    tokens.push({ name: `--${match[1]}`, value: match[2].trim() });
  }
  if (tokens.length === 0) return null;

  return { source: candidate.name, tokens };
}

export function findSuspiciousUseCalls(files: FileEntry[]): SuspiciousUseCall[] {
  const results: SuspiciousUseCall[] = [];
  const pattern = /\b(?:React\.)?use\s*\(/g;
  files.forEach((file) => {
    if (!file.content) return;
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(line))) {
        const after = line.slice(match.index + match[0].length);
        const nextChar = after.trim()[0];
        if (nextChar && ("{[\"'`".includes(nextChar) || /[0-9]/.test(nextChar))) {
          results.push({ file: file.name, line: index + 1, snippet: line.trim() });
          break;
        }
      }
    });
  });
  return results;
}

function normalizeInternalHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/api")) return null;
  if (trimmed.startsWith("/_next")) return null;
  if (trimmed.startsWith("/favicon")) return null;
  if (trimmed.startsWith("/robots")) return null;
  if (trimmed.startsWith("/sitemap")) return null;
  if (trimmed.includes("${")) return null;
  const cleaned = trimmed.split("#")[0].split("?")[0];
  if (!cleaned) return null;
  return cleaned === "" ? "/" : cleaned;
}

export function extractStaticInternalLinks(files: FileEntry[]): string[] {
  const results = new Set<string>();
  const hrefRegex = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["']([^"']+)["']\s*\})/g;
  for (const file of files) {
    if (!file?.content) continue;
    const content = file.content;
    let match: RegExpExecArray | null = null;
    hrefRegex.lastIndex = 0;
    while ((match = hrefRegex.exec(content))) {
      const raw = match[1] || match[2] || match[3] || "";
      const normalized = normalizeInternalHref(raw);
      if (normalized) results.add(normalized);
    }
  }
  return Array.from(results);
}

export function extractAppRoutePaths(files: FileEntry[]): string[] {
  const routes = new Set<string>();
  for (const file of files) {
    const rawName = file.name.replace(/^\/+/, "");
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

function routePatternToRegex(route: string): RegExp {
  const cleaned = route.replace(/\/+$/, "") || "/";
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

export function findMissingRoutes(links: string[], routes: string[]): string[] {
  if (routes.length === 0) return links;
  const matchers = routes.map(routePatternToRegex);
  return links.filter((link) => !matchers.some((matcher) => matcher.test(link)));
}

export function findLucideLinkMisuse(files: FileEntry[]): string[] {
  const affected = new Set<string>();
  const lucideLinkImport =
    /import\s*\{[^}]*\bLink\b[^}]*\}\s*from\s*["']lucide-react["'];?/;
  const hrefUsage = /<Link\b[^>]*\bhref=/;

  for (const file of files) {
    if (!file?.content) continue;
    if (!lucideLinkImport.test(file.content)) continue;
    if (!hrefUsage.test(file.content)) continue;
    affected.add(file.name);
  }

  return Array.from(affected);
}

function findFileBySuffix(files: FileEntry[], suffixes: string[]): FileEntry | null {
  return (
    files.find((file) =>
      suffixes.some((suffix) => file.name === suffix || file.name.endsWith(`/${suffix}`)),
    ) ?? null
  );
}

function countMatches(content: string, regex: RegExp): number {
  return (content.match(regex) || []).length;
}

export function buildSeoReview(files: FileEntry[]): SeoReview {
  const layoutFile = findFileBySuffix(files, ["app/layout.tsx", "src/app/layout.tsx"]);
  const homePageFile = findFileBySuffix(files, ["app/page.tsx", "src/app/page.tsx"]);
  const robotsFile = findFileBySuffix(files, ["app/robots.ts", "src/app/robots.ts"]);
  const sitemapFile = findFileBySuffix(files, ["app/sitemap.ts", "src/app/sitemap.ts"]);

  const layoutContent = layoutFile?.content ?? "";
  const metadata = /\bexport\s+const\s+metadata\b/.test(layoutContent);
  const title = metadata && /\btitle\s*:/.test(layoutContent);
  const description = metadata && /\bdescription\s*:/.test(layoutContent);
  const openGraph = metadata && /\bopenGraph\s*:/.test(layoutContent);
  const twitter = metadata && /\btwitter\s*:/.test(layoutContent);
  const robots = Boolean(robotsFile);
  const sitemap = Boolean(sitemapFile);
  const jsonLd = files.some((file) =>
    /application\/ld\+json|json-ld/i.test(file.content ?? ""),
  );
  const homeH1Count = homePageFile?.content ? countMatches(homePageFile.content, /<h1\b/gi) : null;

  const issues: SeoIssue[] = [];

  if (!metadata) {
    issues.push({
      severity: "warning",
      code: "missing-metadata",
      message: "Layouten saknar export av metadata för title/description.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !title) {
    issues.push({
      severity: "warning",
      code: "missing-title",
      message: "Metadata saknar title.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !description) {
    issues.push({
      severity: "warning",
      code: "missing-description",
      message: "Metadata saknar description.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !openGraph) {
    issues.push({
      severity: "warning",
      code: "missing-open-graph",
      message: "Metadata saknar Open Graph-falt.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !twitter) {
    issues.push({
      severity: "warning",
      code: "missing-twitter",
      message: "Metadata saknar Twitter-kort.",
      file: layoutFile?.name ?? null,
    });
  }
  if (!robots) {
    issues.push({
      severity: "warning",
      code: "missing-robots",
      message: "Projektet saknar app/robots.ts.",
      file: null,
    });
  }
  if (!sitemap) {
    issues.push({
      severity: "warning",
      code: "missing-sitemap",
      message: "Projektet saknar app/sitemap.ts.",
      file: null,
    });
  }
  if (!jsonLd) {
    issues.push({
      severity: "warning",
      code: "missing-json-ld",
      message: "Ingen JSON-LD/schema.org-markup hittades.",
      file: null,
    });
  }
  if (homeH1Count === 0) {
    issues.push({
      severity: "warning",
      code: "missing-h1",
      message: "Startsidan saknar h1-rubrik.",
      file: homePageFile?.name ?? null,
    });
  } else if (homeH1Count !== null && homeH1Count > 1) {
    issues.push({
      severity: "warning",
      code: "multiple-h1",
      message: "Startsidan har flera h1-rubriker.",
      file: homePageFile?.name ?? null,
    });
  }

  return {
    passed: issues.length === 0,
    issues,
    signals: {
      metadata,
      title,
      description,
      openGraph,
      twitter,
      robots,
      sitemap,
      jsonLd,
      homeH1Count,
    },
  };
}

export function buildPostCheckBaseline(params: {
  currentFiles: FileEntry[];
  previousFiles: FileEntry[];
  previousVersionId: string | null;
  versions: VersionEntry[];
  versionId: string;
  demoUrl?: string | null;
  preflight?: PreviewPreflightState | null;
}): PostCheckBaseline {
  const { currentFiles, previousFiles, previousVersionId, versions, versionId, demoUrl, preflight } =
    params;
  const changes = previousVersionId ? diffFiles(previousFiles, currentFiles) : null;
  const suspiciousUseCalls = findSuspiciousUseCalls(currentFiles);
  const warnings: string[] = [];

  if (suspiciousUseCalls.length > 0) {
    warnings.push(
      `Möjlig React use()-missbruk i ${
        new Set(suspiciousUseCalls.map((entry) => entry.file)).size
      } fil(er).`,
    );
  }

  const routePaths = extractAppRoutePaths(currentFiles);
  const internalLinks = extractStaticInternalLinks(currentFiles);
  const missingRoutes = findMissingRoutes(internalLinks, routePaths);
  const lucideLinkMisuse = findLucideLinkMisuse(currentFiles);
  const seoReview = buildSeoReview(currentFiles);
  const sanity = runProjectSanityChecks(
    currentFiles.map((file) => ({
      path: file.name,
      content: file.content ?? "",
      language: inferLanguage(file.name),
    })),
  );
  const sanityIssues = sanity.issues;
  const sanityErrors = sanityIssues.filter((issue) => issue.severity === "error");
  const sanityWarnings = sanityIssues.filter((issue) => issue.severity === "warning");

  if (missingRoutes.length > 0) {
    const preview = missingRoutes.slice(0, 6).join(", ");
    const suffix = missingRoutes.length > 6 ? " …" : "";
    warnings.push(`Saknar route för ${preview}${suffix}.`);
  }
  if (lucideLinkMisuse.length > 0) {
    const preview = lucideLinkMisuse.slice(0, 6).join(", ");
    const suffix = lucideLinkMisuse.length > 6 ? " …" : "";
    warnings.push(`Fel Link-import i ${preview}${suffix}. Använd \`next/link\`, inte \`lucide-react\`.`);
  }
  if (sanityErrors.length > 0 || sanityWarnings.length > 0) {
    warnings.push(`Kodsanity: ${sanityErrors.length} error, ${sanityWarnings.length} warning.`);
  }
  if (!seoReview.passed) {
    const preview = seoReview.issues
      .slice(0, 4)
      .map((issue) => issue.message)
      .join(" | ");
    const suffix = seoReview.issues.length > 4 ? " …" : "";
    warnings.push(`SEO: ${preview}${suffix}`);
  }

  const versionEntry = versions.find(
    (entry) => entry.versionId === versionId || entry.id === versionId,
  );
  const resolvedDemoUrl = demoUrl ?? versionEntry?.demoUrl ?? null;
  const previewBlockingReason = getPreviewBlockingReason(preflight);
  const designTokens = extractDesignTokens(currentFiles);

  if (preflight?.verificationBlocked && resolvedDemoUrl) {
    warnings.push("Preview är tillgänglig, men versionen har verifieringsblockerande preflightfel.");
  }

  return {
    previousVersionId,
    changes,
    warnings,
    missingRoutes,
    lucideLinkMisuse,
    suspiciousUseCalls,
    designTokens,
    seoReview,
    sanity,
    sanityIssues,
    sanityErrors,
    sanityWarnings,
    resolvedDemoUrl,
    previewBlockingReason,
  };
}
