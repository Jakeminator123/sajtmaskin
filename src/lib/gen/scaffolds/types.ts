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

/**
 * Metadata-light projection of the registry for client bundles: importing
 * `registry.ts` would pull every scaffold's `files` into the browser.
 *
 * `label`, `description` and `allowedBuildIntents` are mirrored from each
 * manifest so Byggval can render and filter the choices without that import.
 * `scaffold-client-list.test.ts` fails if the mirror drifts from the manifests.
 */
export const SCAFFOLD_CLIENT_LIST: ReadonlyArray<{
  id: ScaffoldId;
  label: string;
  description: string;
  allowedBuildIntents: ReadonlyArray<"website" | "app" | "template">;
}> = [
  { id: "base-nextjs", label: "Base Next.js", description: "Minimal Next.js starter with Tailwind, App Router, and dark theme.", allowedBuildIntents: ["website", "template"] },
  { id: "landing-page", label: "Landing Page", description: "Polished one-page or multi-section layout for local businesses, service companies, and product launches.", allowedBuildIntents: ["website", "template"] },
  { id: "saas-landing", label: "SaaS Landing", description: "Product-led marketing starter with feature narrative, dashboard preview, pricing, FAQ, and conversion-ready sections.", allowedBuildIntents: ["website", "template"] },
  { id: "portfolio", label: "Portfolio", description: "Personal portfolio starter with intro, selected work, writing, credibility, and contact sections.", allowedBuildIntents: ["website", "template"] },
  { id: "blog", label: "Blog", description: "Content-first blog starter with article list, post layout, author, featured posts, and reading-friendly typography.", allowedBuildIntents: ["website", "template"] },
  { id: "dashboard", label: "Dashboard", description: "Analytics and overview dashboard with sidebar, stats cards, data tables, and chart placeholders. For admin panels, analytics, and SaaS apps.", allowedBuildIntents: ["app"] },
  { id: "auth-pages", label: "Auth Pages", description: "Login, signup, and forgot-password pages with form layout, validation-ready structure, and minimal branding.", allowedBuildIntents: ["website", "app", "template"] },
  { id: "ecommerce", label: "E-handel", description: "Storefront starter with product grid, category filtering, product detail page, cart drawer, and checkout-ready layout.", allowedBuildIntents: ["website", "template"] },
  { id: "app-shell", label: "App Shell", description: "Operational app shell with sidebar navigation, workspace summaries, queue tables, and execution-focused content areas.", allowedBuildIntents: ["app"] },
] as const;
