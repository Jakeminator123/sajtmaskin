import type { ScaffoldFamily } from "@/lib/gen/scaffolds/types";

export type TemplateLibraryVerdict =
  | "valid"
  | "research_only"
  | "bad_repo_link"
  | "non_next_template"
  | "huge_monorepo"
  | "missing_repo"
  | "unverified";

export type NormalizedRepoType =
  | "boilerplate"
  | "starter_kit"
  | "full_app"
  | "landing_template"
  | "commerce_template"
  | "vertical_demo"
  | "design_reference_only"
  | "unknown";

export type PromotionDecision =
  | "runtime_scaffold_candidate"
  | "dossier_only"
  | "template_library_only"
  | "ignore";

export interface NormalizedCatalogEntry {
  id: string;
  slug: string;
  title: string;
  description: string;
  sourceUrl: string;
  repoUrl: string | null;
  demoUrl: string | null;
  categorySlug: string;
  categoryName: string;
  stackTags: string[];
  frameworkMatch: boolean;
  frameworkReason: string;
  repoType: NormalizedRepoType;
  promotionDecision: PromotionDecision;
  qualityScore: number;
  signals: TemplateLibrarySignals;
  recommendedScaffoldFamilies: ScaffoldFamily[];
  repoHealth: NormalizedRepoHealth;
  rationale: string;
}

export interface NormalizedRepoHealth {
  hasReadme: boolean;
  hasPackageJson: boolean;
  hasAppDir: boolean;
  hasSrcAppDir: boolean;
  isMonorepo: boolean;
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | "unknown";
  envVarCount: number;
  placeholderCopyRatio: number;
}

export interface NormalizedCatalogFile {
  generatedAt: string;
  rawSourcePath: string;
  entryCount: number;
  entries: NormalizedCatalogEntry[];
}

export interface TemplateLibrarySelectedFile {
  path: string;
  reason: string;
  excerpt: string;
}

export interface TemplateLibraryRepoInfo {
  url: string | null;
  normalizedUrl: string | null;
  subpath: string | null;
  /** Optional local clone directory under the repo, POSIX path relative to workspace root (if you attach repos to reference entries). */
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
