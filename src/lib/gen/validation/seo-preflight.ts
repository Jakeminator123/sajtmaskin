import type { CodeFile } from "@/lib/gen/parser";
import type { PreflightIssueCategory } from "@/lib/gen/stream/preflight-contract";

export type SeoPreflightIssue = {
  file: string;
  severity: "error" | "warning";
  code: string;
  message: string;
  category?: PreflightIssueCategory;
};

const LAYOUT_SUFFIXES = ["app/layout.tsx", "src/app/layout.tsx"];
const PAGE_SUFFIXES = ["app/page.tsx", "src/app/page.tsx"];
const METADATA_EXPORT_RE =
  /\bexport\s+(?:const\s+metadata\b|(?:async\s+)?function\s+generateMetadata\b)/;

function findFileBySuffix(files: CodeFile[], suffixes: string[]): CodeFile | undefined {
  for (const suffix of suffixes) {
    const found = files.find((f) => f.path === suffix || f.path.endsWith(`/${suffix}`));
    if (found) return found;
  }
  return undefined;
}

function hasFile(files: CodeFile[], suffixes: string[]): boolean {
  return findFileBySuffix(files, suffixes) !== undefined;
}

function createSeoIssue(
  file: string,
  severity: "error" | "warning",
  code: string,
  message: string,
): SeoPreflightIssue {
  return {
    file,
    severity,
    code,
    message,
    category: "non_blocking_quality_warning",
  };
}

export function runSeoPreflightChecks(files: CodeFile[]): SeoPreflightIssue[] {
  const issues: SeoPreflightIssue[] = [];
  const layoutFile = findFileBySuffix(files, LAYOUT_SUFFIXES);
  const homePageFile = findFileBySuffix(files, PAGE_SUFFIXES);
  const layoutContent = layoutFile?.content ?? "";
  const hasMetadataExport =
    METADATA_EXPORT_RE.test(layoutContent) || /\bgenerateMetadata\s*\(/.test(layoutContent);
  const hasTitle = hasMetadataExport && /\btitle\s*:/.test(layoutContent);
  const hasDescription = hasMetadataExport && /\bdescription\s*:/.test(layoutContent);
  const hasOpenGraph = hasMetadataExport && /\bopenGraph\s*:/.test(layoutContent);
  const hasRobots = hasFile(files, ["app/robots.ts", "src/app/robots.ts"]);
  const hasSitemap = hasFile(files, ["app/sitemap.ts", "src/app/sitemap.ts"]);
  const homeH1Count = homePageFile?.content
    ? (homePageFile.content.match(/<h1\b/gi) ?? []).length
    : 0;

  const layoutPath = layoutFile?.path ?? "app/layout.tsx";

  if (!hasMetadataExport) {
    issues.push(
      createSeoIssue(
        layoutPath,
        "error",
        "missing-metadata",
        "Layouten saknar export av metadata för title/description.",
      ),
    );
  }
  if (hasMetadataExport && !hasTitle) {
    issues.push(createSeoIssue(layoutPath, "error", "missing-title", "Metadata saknar title."));
  }
  if (hasMetadataExport && !hasDescription) {
    issues.push(
      createSeoIssue(layoutPath, "warning", "missing-description", "Metadata saknar description."),
    );
  }
  if (!hasRobots) {
    issues.push(createSeoIssue("seo", "warning", "missing-robots", "Projektet saknar app/robots.ts."));
  }
  if (!hasSitemap) {
    issues.push(createSeoIssue("seo", "warning", "missing-sitemap", "Projektet saknar app/sitemap.ts."));
  }
  if (homePageFile && homeH1Count === 0) {
    issues.push(createSeoIssue(homePageFile.path, "warning", "missing-h1", "Startsidan saknar h1-rubrik."));
  }
  if (hasMetadataExport && !hasOpenGraph) {
    issues.push(
      createSeoIssue(layoutPath, "warning", "missing-open-graph", "Metadata saknar Open Graph-fält."),
    );
  }

  return issues;
}
