export type ScaffoldFamily =
  | "base-nextjs"
  | "content-site"
  | "app-shell"
  | "landing-page"
  | "saas-landing"
  | "portfolio"
  | "blog"
  | "dashboard"
  | "auth-pages"
  | "ecommerce"
  | "photo-shop";
export type ScaffoldMode = "off" | "auto" | "manual";

export type ScaffoldSiteKind = "marketing" | "app" | "commerce" | "editorial";
export type ScaffoldComplexity = "simple" | "medium" | "advanced";

export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface ScaffoldReferenceTemplate {
  id: string;
  title: string;
  categorySlug: string;
  qualityScore: number;
  strengths: string[];
}

export interface ScaffoldResearchMetadata {
  upgradeTargets: string[];
  referenceTemplates: ScaffoldReferenceTemplate[];
}

export interface ScaffoldManifest {
  id: string;
  family: ScaffoldFamily;
  label: string;
  description: string;
  /**
   * Structure role: controls baseline file/project shape.
   * Example: app-shell, one-page-marketing, editorial-hub.
   */
  structureProfile?: string;
  /**
   * Content role: controls domain/content direction independent of structure.
   * Example: service-business, portfolio-creator, ecommerce-catalog.
   */
  contentProfile?: string;
  /** First-step traits metadata for composable scaffold evolution. */
  siteKind?: ScaffoldSiteKind;
  complexity?: ScaffoldComplexity;
  features?: string[];
  buildIntents: Array<"website" | "app" | "template">;
  tags: string[];
  promptHints: string[];
  files: ScaffoldFile[];
  qualityChecklist?: string[];
  research?: ScaffoldResearchMetadata;
}
