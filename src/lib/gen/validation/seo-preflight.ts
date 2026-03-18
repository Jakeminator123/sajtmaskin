import type { CodeFile } from "@/lib/gen/parser";

export type SeoPreflightIssue = {
  file: string;
  severity: "error" | "warning";
  code: string;
  message: string;
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
    issues.push({
      file: layoutPath,
      severity: "error",
      code: "missing-metadata",
      message: "Layouten saknar export av metadata för title/description.",
    });
  }
  if (hasMetadataExport && !hasTitle) {
    issues.push({
      file: layoutPath,
      severity: "error",
      code: "missing-title",
      message: "Metadata saknar title.",
    });
  }
  if (hasMetadataExport && !hasDescription) {
    issues.push({
      file: layoutPath,
      severity: "warning",
      code: "missing-description",
      message: "Metadata saknar description.",
    });
  }
  if (!hasRobots) {
    issues.push({
      file: "seo",
      severity: "warning",
      code: "missing-robots",
      message: "Projektet saknar app/robots.ts.",
    });
  }
  if (!hasSitemap) {
    issues.push({
      file: "seo",
      severity: "warning",
      code: "missing-sitemap",
      message: "Projektet saknar app/sitemap.ts.",
    });
  }
  if (homePageFile && homeH1Count === 0) {
    issues.push({
      file: homePageFile.path,
      severity: "warning",
      code: "missing-h1",
      message: "Startsidan saknar h1-rubrik.",
    });
  }
  if (hasMetadataExport && !hasOpenGraph) {
    issues.push({
      file: layoutPath,
      severity: "warning",
      code: "missing-open-graph",
      message: "Metadata saknar Open Graph-fält.",
    });
  }

  return issues;
}
