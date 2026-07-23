import type { PreviewPreflightState } from "@/lib/gen/preview/diagnostics";
import { extractAppRoutePathsFromFilePaths, findMissingPlannedRoutes, type PlannedRoute } from "@/lib/gen/route-plan";
import {
  runProjectSanityChecks,
  type SanityIssue,
  type SanityResult,
} from "@/lib/gen/validation/project-sanity";
import { DESIGN_TOKEN_FILES } from "./constants";
import { diffFiles, type FileDiff } from "./post-checks-diff";
import { getPreviewBlockingReason } from "./post-checks-preview";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
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
    | "missing-canonical"
    | "missing-open-graph"
    | "missing-og-image"
    | "missing-twitter"
    | "missing-robots"
    | "missing-sitemap"
    | "missing-json-ld"
    | "missing-h1"
    | "multiple-h1"
    | "heading-hierarchy";
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
    canonical: boolean;
    openGraph: boolean;
    ogImage: boolean;
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
  missingPlannedRoutes: PlannedRoute[];
  lucideLinkMisuse: string[];
  suspiciousUseCalls: SuspiciousUseCall[];
  designTokens: DesignTokenSummary | null;
  /**
   * Advisory-only SEO scan. Not shown in the chat post-check anymore
   * (2026-07-23 declutter) — kept because the `seo` error-log row feeds the
   * launch-readiness advisories and the publish surface.
   */
  seoReview: SeoReview;
  sanity: SanityResult;
  sanityIssues: SanityIssue[];
  sanityErrors: SanityIssue[];
  sanityWarnings: SanityIssue[];
  resolvedDemoUrl: string | null;
  previewBlockingReason: string | null;
};

function extractDesignTokens(files: FileEntry[]): DesignTokenSummary | null {
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

function findSuspiciousUseCalls(files: FileEntry[]): SuspiciousUseCall[] {
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

function extractStaticInternalLinks(files: FileEntry[]): string[] {
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

function findMissingRoutes(links: string[], routes: string[]): string[] {
  if (routes.length === 0) return links;
  const matchers = routes.map(routePatternToRegex);
  return links.filter((link) => !matchers.some((matcher) => matcher.test(link)));
}

function findLucideLinkMisuse(files: FileEntry[]): string[] {
  const affected = new Set<string>();
  const lucideLinkImport =
    /import\s*\{[^}]*\bLink\b[^}]*\}\s*from\s*["']lucide-react["'];?/;
  const hrefUsage = /<Link\b[^>]*\bhref\s*=/;

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

function hasBrokenHeadingHierarchy(content: string): boolean {
  const headingMatches = Array.from(content.matchAll(/<h([1-6])\b/gi));
  if (headingMatches.length <= 1) return false;
  let previousLevel: number | null = null;
  for (const match of headingMatches) {
    const currentLevel = Number(match[1]);
    if (!Number.isFinite(currentLevel)) continue;
    if (previousLevel !== null && currentLevel - previousLevel > 1) {
      return true;
    }
    previousLevel = currentLevel;
  }
  return false;
}

function buildSeoReview(files: FileEntry[]): SeoReview {
  const layoutFile = findFileBySuffix(files, ["app/layout.tsx", "src/app/layout.tsx"]);
  const homePageFile = findFileBySuffix(files, ["app/page.tsx", "src/app/page.tsx"]);
  const robotsFile = findFileBySuffix(files, ["app/robots.ts", "src/app/robots.ts"]);
  const sitemapFile = findFileBySuffix(files, ["app/sitemap.ts", "src/app/sitemap.ts"]);
  const opengraphFile = findFileBySuffix(files, [
    "app/opengraph-image.tsx",
    "src/app/opengraph-image.tsx",
    "app/opengraph-image.png",
    "src/app/opengraph-image.png",
    "app/opengraph-image.jpg",
    "src/app/opengraph-image.jpg",
    "app/opengraph-image.jpeg",
    "src/app/opengraph-image.jpeg",
  ]);

  const layoutContent = layoutFile?.content ?? "";
  const metadata = /\bexport\s+const\s+metadata\b/.test(layoutContent);
  const title = metadata && /\btitle\s*:/.test(layoutContent);
  const description = metadata && /\bdescription\s*:/.test(layoutContent);
  const canonical = metadata && (/\balternates\s*:/.test(layoutContent) || /\bcanonical\s*:/.test(layoutContent) || /rel=["']canonical["']/.test(layoutContent));
  const openGraph = metadata && /\bopenGraph\s*:/.test(layoutContent);
  const ogImage = (openGraph && /\bimages\s*:/.test(layoutContent)) || Boolean(opengraphFile);
  const twitter = metadata && /\btwitter\s*:/.test(layoutContent);
  const robots = Boolean(robotsFile);
  const sitemap = Boolean(sitemapFile);
  const jsonLd = files.some((file) =>
    /application\/ld\+json|json-ld/i.test(file.content ?? ""),
  );
  const homeH1Count = homePageFile?.content ? countMatches(homePageFile.content, /<h1\b/gi) : null;
  const pageFiles = files.filter((file) =>
    /(^|\/)app\/.*page\.(tsx|jsx)$/.test(file.name) || /(^|\/)src\/app\/.*page\.(tsx|jsx)$/.test(file.name),
  );

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
  if (metadata && !canonical) {
    issues.push({
      severity: "warning",
      code: "missing-canonical",
      message: "Metadata saknar canonical-strategi.",
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
  if (openGraph && !ogImage) {
    issues.push({
      severity: "warning",
      code: "missing-og-image",
      message: "Open Graph saknar bildstrategi (metadata images eller opengraph-image-fil).",
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
  for (const pageFile of pageFiles.slice(0, 12)) {
    if (hasBrokenHeadingHierarchy(pageFile.content ?? "")) {
      issues.push({
        severity: "warning",
        code: "heading-hierarchy",
        message: "Rubrikhierarkin hoppar över nivåer (t.ex. h1 -> h3).",
        file: pageFile.name,
      });
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    signals: {
      metadata,
      title,
      description,
      canonical,
      openGraph,
      ogImage,
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

  const routePaths = extractAppRoutePathsFromFilePaths(currentFiles.map((file) => file.name));
  const internalLinks = extractStaticInternalLinks(currentFiles);
  const missingRoutes = findMissingRoutes(internalLinks, routePaths);
  const missingPlannedRoutes = findMissingPlannedRoutes(preflight?.routePlan, routePaths);
  const lucideLinkMisuse = findLucideLinkMisuse(currentFiles);
  const seoReview = buildSeoReview(currentFiles);
  const sanity = runProjectSanityChecks(
    currentFiles.map((file) => ({
      path: file.name,
      content: file.content ?? "",
      language: inferFileLanguage(file.name),
    })),
    { scaffoldBaselineCoversPackageJson: true },
  );
  const sanityIssues = sanity.issues;
  const sanityErrors = sanityIssues.filter((issue) => issue.severity === "error");
  const sanityWarnings = sanityIssues.filter((issue) => issue.severity === "warning");

  if (missingRoutes.length > 0) {
    const preview = missingRoutes.slice(0, 6).join(", ");
    const suffix = missingRoutes.length > 6 ? " …" : "";
    warnings.push(`Saknar route för ${preview}${suffix}.`);
  }
  // Route-plan mismatches are already emitted by preflight diagnostics.
  // Keep this data in baseline for tooling, but avoid duplicate user-facing warnings.
  if (lucideLinkMisuse.length > 0) {
    const preview = lucideLinkMisuse.slice(0, 6).join(", ");
    const suffix = lucideLinkMisuse.length > 6 ? " …" : "";
    warnings.push(`Fel Link-import i ${preview}${suffix}. Använd \`next/link\`, inte \`lucide-react\`.`);
  }
  if (sanityErrors.length > 0 || sanityWarnings.length > 0) {
    warnings.push(`Kodsanity: ${sanityErrors.length} error, ${sanityWarnings.length} warning.`);
  }
  // SEO is advisory-only and no longer part of the user-facing warning
  // baseline (2026-07-23 declutter). The `seo` error-log row below still
  // feeds the launch-readiness advisories.

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
    missingPlannedRoutes,
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
