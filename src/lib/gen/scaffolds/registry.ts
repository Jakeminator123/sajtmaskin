/**
 * Internal scaffold registry — the single source of truth for runtime
 * scaffold selection. Only scaffolds listed in ALL_SCAFFOLDS are used
 * by matchScaffoldAuto() during code generation.
 *
 * External Vercel template research (e.g. data/external-template-pipeline/,
 * _template_refs/) is reference material for new internal scaffolds.
 * They are NOT used at runtime and have no connection to this registry.
 */
import type { ScaffoldManifest, ScaffoldId } from "./types";
import { baseNextjsManifest } from "./base-nextjs/manifest";
import { contentSiteManifest } from "./content-site/manifest";
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

const BASE_SCAFFOLDS: ScaffoldManifest[] = [
  baseNextjsManifest,
  landingPageManifest,
  saasLandingManifest,
  portfolioManifest,
  blogManifest,
  dashboardManifest,
  authPagesManifest,
  ecommerceManifest,
  contentSiteManifest,
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
  return applyScaffoldSeoDefaults(withResearchOverrides);
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
