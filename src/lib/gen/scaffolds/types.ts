export type ScaffoldId =
  | "base-nextjs"
  | "app-shell"
  | "landing-page"
  | "saas-landing"
  | "portfolio"
  | "blog"
  | "dashboard"
  | "auth-pages"
  | "ecommerce";

export type ScaffoldMode = "off" | "auto" | "manual";

export type ScaffoldSiteKind = "marketing" | "app" | "commerce" | "editorial";
export type ScaffoldComplexity = "simple" | "medium" | "advanced";

/**
 * Scaffold Contract V2 — per-file prompt rendering policy.
 *
 * `role` describes the file's structural meaning so prompt assembly can
 * decide how much detail to inject. Defaults are derived from path
 * heuristics (see `serialize.ts → defaultRoleForPath`); manifest authors
 * only need to set `role` when the heuristic would pick the wrong one
 * (e.g. a `components/page-shell.tsx` that should render as full layout).
 */
export type ScaffoldFilePromptRole =
  | "root-layout"
  | "global-styles"
  | "config"
  | "route-page"
  | "shared-component"
  | "api-route"
  | "default";

/**
 * Scaffold Contract V2 — how much of a scaffold file is materialized in
 * the system prompt. `full` keeps the entire content when it fits the
 * critical-files budget, `excerpt` renders a FileContract with imports,
 * exports, structure, and capped representative lines, and `signature`
 * keeps imports/exports/structure without body lines. The default is
 * derived from `role`.
 */
export type ScaffoldFileSerialization = "full" | "excerpt" | "signature";

export interface ScaffoldFile {
  path: string;
  content: string;
  /**
   * V2 (optional): structural role of the file. Drives the default
   * serialization strategy in `serialize.ts`. When omitted, the role
   * is inferred from the path so existing scaffolds compile unchanged.
   */
  role?: ScaffoldFilePromptRole;
  /**
   * V2 (optional): explicit override of the default serialization
   * strategy for this file. Use when the role-default does not match
   * the file's prompt importance (e.g. a bespoke `app/page.tsx` that
   * the LLM should treat as `full`).
   */
  serialization?: ScaffoldFileSerialization;
  /**
   * V2 (optional): per-file ceiling for FileContract representative
   * lines. Used when `serialization` resolves to `"excerpt"` and when a
   * large `"full"` file falls back to FileContract.
   */
  maxPromptChars?: number;
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
  id: ScaffoldId;
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
  allowedBuildIntents: Array<"website" | "app" | "template">;
  tags: string[];
  promptHints: string[];
  files: ScaffoldFile[];
  qualityChecklist?: string[];
  research?: ScaffoldResearchMetadata;
}

export const SCAFFOLD_CLIENT_LIST: ReadonlyArray<{ id: ScaffoldId; label: string; description: string }> = [
  { id: "base-nextjs", label: "Base Next.js", description: "Minimal Next.js starter with Tailwind, App Router, and dark theme." },
  { id: "landing-page", label: "Landing Page", description: "Marketing landing page with hero, services, testimonials, and CTA." },
  { id: "saas-landing", label: "SaaS Landing", description: "SaaS marketing site with pricing tiers, features, and trial CTA." },
  { id: "portfolio", label: "Portfolio", description: "Creative portfolio with project gallery, case studies, and contact." },
  { id: "blog", label: "Blog", description: "Editorial blog with article list, categories, and author pages." },
  { id: "dashboard", label: "Dashboard", description: "Analytics dashboard with charts, KPI cards, and data tables." },
  { id: "auth-pages", label: "Auth Pages", description: "Authentication pages: sign in, sign up, and password reset." },
  { id: "ecommerce", label: "E-handel", description: "E-commerce storefront with product grid, cart, and checkout." },
  { id: "app-shell", label: "App Shell", description: "Application shell with sidebar, settings, and workspace layout." },
] as const;
