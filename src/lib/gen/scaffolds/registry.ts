/**
 * Internal scaffold registry — the single source of truth for runtime
 * scaffold selection. Only scaffolds listed in ALL_SCAFFOLDS are used
 * by matchScaffoldAuto() during code generation.
 *
 * Per-integration guidance reaches runtime via the dossier pipeline
 * (`src/lib/gen/dossiers/`). The legacy template-library pipeline
 * (`scripts/template-library/`, `data/external-template-pipeline/`) is
 * deprecated and stashed under `legacy-stuff/` outside this repo.
 */
import type { ScaffoldManifest, ScaffoldId } from "./types";
import { baseNextjsManifest } from "./base-nextjs/manifest";
import { appShellManifest } from "./app-shell/manifest";
import { landingPageManifest } from "./landing-page/manifest";
import { saasLandingManifest } from "./saas-landing/manifest";
import { portfolioManifest } from "./portfolio/manifest";
import { blogManifest } from "./blog/manifest";
import { dashboardManifest } from "./dashboard/manifest";
import { authPagesManifest } from "./auth-pages/manifest";
import { ecommerceManifest } from "./ecommerce/manifest";
import { getScaffoldResearchOverrides } from "./scaffold-research";
import { applyScaffoldSeoDefaults } from "./seo-defaults";

const DEFAULT_ICON_FILE = {
  path: "app/icon.svg",
  content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#0f172a"/>
  <path d="M8 19.5h16v1.25A3.25 3.25 0 0 1 20.75 24h-9.5A3.25 3.25 0 0 1 8 20.75V19.5Z" fill="#f97316"/>
  <path d="M7 16.5h18v2H7v-2Z" fill="#facc15"/>
  <path d="M9 12.5C9 10 12.1 8 16 8s7 2 7 4.5V14H9v-1.5Z" fill="#38bdf8"/>
</svg>
`,
  language: "svg" as const,
};

// The legacy marketing scaffold (former id was merged into `landing-page`
// 2026-04-23 in OMTAG fas 2·B / M1 — see docs/architecture/glossary.md for
// details).
const BASE_SCAFFOLDS: ScaffoldManifest[] = [
  baseNextjsManifest,
  landingPageManifest,
  saasLandingManifest,
  portfolioManifest,
  blogManifest,
  dashboardManifest,
  authPagesManifest,
  ecommerceManifest,
  appShellManifest,
];

function mergeUniqueStrings(base: string[] = [], override: string[] = []): string[] {
  return [...new Set([...base, ...override].map((value) => value.trim()).filter(Boolean))];
}

function mergeScaffoldResearch(
  base: ScaffoldManifest["research"],
  override: ScaffoldManifest["research"],
): ScaffoldManifest["research"] {
  if (!base && !override) return undefined;
  return {
    upgradeTargets: mergeUniqueStrings(base?.upgradeTargets ?? [], override?.upgradeTargets ?? []),
    referenceTemplates:
      override?.referenceTemplates && override.referenceTemplates.length > 0
        ? override.referenceTemplates
        : (base?.referenceTemplates ?? []),
  };
}

function withDefaultIcon(scaffold: ScaffoldManifest): ScaffoldManifest {
  if (scaffold.files.some((file) => file.path === DEFAULT_ICON_FILE.path)) {
    return scaffold;
  }
  return {
    ...scaffold,
    files: [...scaffold.files, DEFAULT_ICON_FILE],
  };
}

const ALL_SCAFFOLDS: ScaffoldManifest[] = BASE_SCAFFOLDS.map((scaffold) => {
  const withResearchOverrides = (() => {
    const overrides = getScaffoldResearchOverrides(scaffold.id);
    return {
      ...scaffold,
      ...overrides,
      qualityChecklist: mergeUniqueStrings(
        scaffold.qualityChecklist ?? [],
        overrides.qualityChecklist ?? [],
      ),
      research: mergeScaffoldResearch(scaffold.research, overrides.research),
    };
  })();
  return withDefaultIcon(applyScaffoldSeoDefaults(withResearchOverrides));
});

export function getScaffoldById(id: string): ScaffoldManifest | null {
  return ALL_SCAFFOLDS.find((s) => s.id === id) ?? null;
}

export function getAllScaffolds(): ScaffoldManifest[] {
  return ALL_SCAFFOLDS;
}

export function getScaffoldIds(): ScaffoldId[] {
  return [...new Set(ALL_SCAFFOLDS.map((s) => s.id))];
}
