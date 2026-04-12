import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const dashboardManifest: ScaffoldManifest = {
  id: "dashboard",
  label: "Dashboard",
  description:
    "Analytics and overview dashboard with sidebar, stats cards, data tables, and chart placeholders. For admin panels, analytics, and SaaS apps.",
  siteKind: "app",
  complexity: "advanced",
  structureProfile: "dashboard-app",
  contentProfile: "operations-analytics",
  features: ["auth", "navigation-shell", "tables", "charts"],
  allowedBuildIntents: ["app"],
  tags: [
    "dashboard",
    "analytics",
    "admin",
    "stats",
    "metrics",
    "panel",
    "overview",
    "instrumentpanel",
    "statistik",
  ],
  promptHints: [
    "Use this scaffold for analytics-heavy dashboards, KPI monitoring, admin overviews, and data operations.",
    "Keep the sidebar navigation, stats cards, trend sections, and chart surfaces. Replace all metrics with domain-specific data.",
    "Treat this as an analytics cockpit rather than a CRUD workspace. Add deeper charts and reporting detail where needed.",
  ],
  qualityChecklist: [
    "The layout should remain app-like, dense, and operational rather than turning into a marketing page.",
    "Sidebar, top summary cards, and main data surfaces should match the user's actual domain and workflows.",
    "Tables, charts, and filters should look purposeful and realistic even when the data is static.",
  ],
  research: {
    upgradeTargets: [
      "Add a date range selector that drives KPI cards and chart datasets.",
      "Include segmented analytics views (traffic, conversion, retention) with tabs.",
      "Add export actions (CSV/PDF) and report scheduling placeholders.",
    ],
    referenceTemplates: [
      { id: "admin-dashboard-modernize-next-js-admin-dashboard-template", title: "Modernize Next.js Admin Dashboard", categorySlug: "admin-dashboard", qualityScore: 96, strengths: ["verified Next.js codebase", "dashboard shell patterns", "sidebar and table patterns"] },
      { id: "saas-router-so-headless-forms-and-lead-routing", title: "Router.so Headless Forms", categorySlug: "saas", qualityScore: 96, strengths: ["verified Next.js codebase", "data-driven UI patterns", "form routing"] },
    ],
  },
  files: loadScaffoldFiles("dashboard"),
};
