import type { ScaffoldFamily } from "@/lib/gen/scaffolds/types";

export type TemplateLibraryVerdict =
  | "valid"
  | "research_only"
  | "bad_repo_link"
  | "non_next_template"
  | "huge_monorepo"
  | "missing_repo"
  | "unverified";

export interface TemplateLibrarySelectedFile {
  path: string;
  reason: string;
  excerpt: string;
}

export interface TemplateLibraryRepoInfo {
  url: string | null;
  normalizedUrl: string | null;
  subpath: string | null;
  clonePath: string | null;
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | "unknown";
  hasNext: boolean;
  hasReact: boolean;
  isMonorepo: boolean;
  hasAppDir: boolean;
  hasSrcAppDir: boolean;
}

export interface TemplateLibrarySignals {
  auth: boolean;
  dashboard: boolean;
  pricing: boolean;
  blog: boolean;
  portfolio: boolean;
  ecommerce: boolean;
  docs: boolean;
  ai: boolean;
  multiTenant: boolean;
  cms: boolean;
}

export interface TemplateLibraryEntry {
  id: string;
  slug: string;
  title: string;
  categorySlug: string;
  categoryName: string;
  templateUrl: string;
  demoUrl: string | null;
  description: string;
  frameworkReason: string;
  frameworkMatch: boolean;
  verdict: TemplateLibraryVerdict;
  qualityScore: number;
  repo: TemplateLibraryRepoInfo;
  stackTags: string[];
  usefulLines: string[];
  noiseLines: string[];
  strengths: string[];
  weaknesses: string[];
  recommendedScaffoldFamilies: ScaffoldFamily[];
  signals: TemplateLibrarySignals;
  summary: string;
  selectedFiles: TemplateLibrarySelectedFile[];
}

export interface TemplateLibraryCatalogFile {
  generatedAt: string;
  sourceRoot: string;
  totalTemplates: number;
  curatedTemplates: number;
  entries: TemplateLibraryEntry[];
}

export interface TemplateLibrarySearchResult {
  entry: TemplateLibraryEntry;
  score: number;
}
