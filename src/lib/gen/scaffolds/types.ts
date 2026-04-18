export type ScaffoldId =
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
  | "business-services";

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
  { id: "content-site", label: "Content Site", description: "Multi-section content site with hero, features, and testimonials." },
  { id: "app-shell", label: "App Shell", description: "Application shell with sidebar, settings, and workspace layout." },
  { id: "business-services", label: "Business & Services", description: "Professional service site for offices, clinics, agencies, and consultants with services grid, process, pricing, and contact." },
] as const;
