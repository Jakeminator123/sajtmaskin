import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const appShellManifest: ScaffoldManifest = {
  id: "app-shell",
  label: "App Shell",
  description:
    "Demo operational app shell with sidebar, sample workspace summaries, queues, and tasks. Authentication, live data, notifications, and settings persistence require integration.",
  siteKind: "app",
  complexity: "medium",
  structureProfile: "application-shell",
  contentProfile: "workspace-tools",
  features: ["sidebar-layout", "settings", "dash-widgets"],
  allowedBuildIntents: ["app"],
  tags: [
    "app-shell",
    "workspace",
    "operations",
    "crm",
    "saas",
    "backoffice",
    "admin",
    "portal",
    "internal-tool",
    "sidebar",
    "kontrollpanel",
    "verktyg",
  ],
  promptHints: [
    "Use this scaffold for operational apps, internal tools, and workflow-oriented SaaS backoffices.",
    "Keep the sidebar + main workspace pattern, but prioritize queues, tasks, and action states over analytics storytelling.",
    "Use actionable tables, statuses, and task cards that map to real product workflows.",
    "Preserve the shell structure while adapting entities, labels, and actions to the user's domain.",
    "Sample KPIs, queues, users, activity, and provider status must be visibly labelled as demo until connected. Preserve facts provided by the brief or verified sources; never invent live results or trust claims.",
    "Authentication, settings persistence, notifications, billing, and provider actions are not connected. Keep unavailable actions disabled and visibly explain the boundary until a real integration exists.",
  ],
  qualityChecklist: [
    "Navigation shell, app density, and workspace feel should stay more prominent than marketing content.",
    "Primary panels, tables, and summaries should map to the user's real product/workflow.",
    "Account, billing, settings, or workspace affordances should feel layerable without breaking the shell.",
    "Keep the shared demo label on secondary routes. Sample identity is not a session, and editable settings fields do not imply saved preferences or connected notification providers.",
  ],
  research: {
    upgradeTargets: [
      "Add role-based navigation sections and per-role entry dashboards.",
      "Include bulk actions and row-level quick actions in queue tables.",
      "Add command palette and keyboard shortcuts for power-user workflows.",
    ],
  },
  // Pure move of the former getScaffoldDefaultRoutes switch (route-plan
  // planning-helpers): /settings was planned as optional, and only when
  // buildIntent was "app".
  // SM-048 (owner decision 2026-08-14): /pipeline and /tasks are declared
  // (page files exist, never planned) which also resolved their SM-042 gate
  // drift. The plan filter in finalize-merge drops them when the plan does
  // not include them; nav-sync rewrites the `navSurface` sidebar to match,
  // so no dead links remain. No delivery group: the pages only link via the
  // sidebar, which mirrors the plan.
  routeContract: {
    requiredRoutes: [],
    optionalRoutes: [
      {
        path: "/settings",
        name: "Settings",
        planIntent: "App shells should usually expose at least one management/settings route.",
        planOnlyForBuildIntents: ["app"],
      },
    ],
    declaredRoutePaths: ["/pipeline", "/tasks"],
    dynamicRoutePatterns: [],
  },
  navSurface: "components/app-sidebar.tsx",
  files: loadScaffoldFiles("app-shell"),
};
