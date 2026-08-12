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

export type PostCheckBaseline = {
  previousVersionId: string | null;
  changes: FileDiff | null;
  warnings: string[];
  missingRoutes: string[];
  missingPlannedRoutes: PlannedRoute[];
  lucideLinkMisuse: string[];
  suspiciousUseCalls: SuspiciousUseCall[];
  designTokens: DesignTokenSummary | null;
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
  const sanity = runProjectSanityChecks(
    currentFiles.map((file) => ({
      path: file.name,
      content: file.content ?? "",
      language: inferFileLanguage(file.name),
    })),
    { scaffoldBaselineCoversPackageJson: true },
  );
  // Mirror the server's imported-repo sanity policy (finalize-preflight.ts →
  // runFinalizePreflightAll): imported v0/ZIP/GitHub templates ship stock
  // files (e.g. shadcn `components/ui/command.tsx` without DialogTitle) that
  // violate own-engine scaffold contracts the user never touched. The server
  // preflight downgrades those errors to warnings, but this client pass used
  // to re-run sanity WITHOUT the downgrade — `project_sanity_errors` then
  // failed readiness and stranded the version in draft/pending (prod chat
  // 0d52e5c9, 2026-07-31). Same chat-level signal as the server:
  // any version with edit_kind="imported_repo" in the history.
  const importedRepoMode = versions.some(
    (entry) => entry.editKind === "imported_repo",
  );
  const sanityIssues = importedRepoMode
    ? sanity.issues.map((issue) =>
        issue.severity === "error"
          ? {
              ...issue,
              severity: "warning" as const,
              category: "non_blocking_quality_warning" as const,
            }
          : issue,
      )
    : sanity.issues;
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
    sanity,
    sanityIssues,
    sanityErrors,
    sanityWarnings,
    resolvedDemoUrl,
    previewBlockingReason,
  };
}
