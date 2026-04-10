import type {
  ScaffoldComplexity,
  ScaffoldManifest,
  ScaffoldSiteKind,
} from "./types";

type ScaffoldTraits = {
  siteKind: ScaffoldSiteKind;
  complexity: ScaffoldComplexity;
  structureProfile: string;
  contentProfile: string;
  features: string[];
};

const TRAITS_BY_SCAFFOLD_ID: Record<string, ScaffoldTraits> = {
  "base-nextjs": {
    siteKind: "marketing",
    complexity: "simple",
    structureProfile: "starter-nextjs",
    contentProfile: "generic",
    features: ["routing-basics", "seo-metadata", "component-ready"],
  },
  "landing-page": {
    siteKind: "marketing",
    complexity: "medium",
    structureProfile: "one-page-marketing",
    contentProfile: "service-business",
    features: ["hero", "trust-signals", "cta"],
  },
  "saas-landing": {
    siteKind: "marketing",
    complexity: "medium",
    structureProfile: "multi-section-marketing",
    contentProfile: "saas-growth",
    features: ["pricing", "feature-grid", "comparison", "cta"],
  },
  portfolio: {
    siteKind: "editorial",
    complexity: "medium",
    structureProfile: "showcase-site",
    contentProfile: "creator-portfolio",
    features: ["gallery", "project-cases", "contact-cta"],
  },
  blog: {
    siteKind: "editorial",
    complexity: "medium",
    structureProfile: "editorial-hub",
    contentProfile: "long-form-content",
    features: ["article-list", "taxonomy", "author-bio"],
  },
  dashboard: {
    siteKind: "app",
    complexity: "advanced",
    structureProfile: "dashboard-app",
    contentProfile: "operations-analytics",
    features: ["auth", "navigation-shell", "tables", "charts"],
  },
  "auth-pages": {
    siteKind: "app",
    complexity: "simple",
    structureProfile: "auth-surface",
    contentProfile: "authentication",
    features: ["login", "signup", "password-reset"],
  },
  ecommerce: {
    siteKind: "commerce",
    complexity: "advanced",
    structureProfile: "commerce-storefront",
    contentProfile: "product-catalog",
    features: ["product-grid", "cart", "checkout", "product-detail"],
  },
  "content-site": {
    siteKind: "marketing",
    complexity: "medium",
    structureProfile: "content-marketing-site",
    contentProfile: "brand-storytelling",
    features: ["hero", "feature-sections", "testimonials", "cta"],
  },
  "app-shell": {
    siteKind: "app",
    complexity: "medium",
    structureProfile: "application-shell",
    contentProfile: "workspace-tools",
    features: ["auth", "sidebar-layout", "settings", "dash-widgets"],
  },
  "docs-knowledge": {
    siteKind: "editorial",
    complexity: "medium",
    structureProfile: "multi-page-docs",
    contentProfile: "technical-reference",
    features: ["sidebar-nav", "search", "breadcrumbs", "collapsible-sections"],
  },
  "form-workflow": {
    siteKind: "marketing",
    complexity: "medium",
    structureProfile: "form-centric",
    contentProfile: "service-intake",
    features: ["multi-step-form", "validation", "calendar-picker", "confirmation-page"],
  },
};

export function applyScaffoldTraits(scaffold: ScaffoldManifest): ScaffoldManifest {
  const traits = TRAITS_BY_SCAFFOLD_ID[scaffold.id];
  if (!traits) return scaffold;
  return {
    ...scaffold,
    siteKind: traits.siteKind,
    complexity: traits.complexity,
    structureProfile: traits.structureProfile,
    contentProfile: traits.contentProfile,
    features: Array.from(new Set([...(scaffold.features ?? []), ...traits.features])),
  };
}
