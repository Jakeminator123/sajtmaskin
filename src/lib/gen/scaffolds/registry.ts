/**
 * Internal scaffold registry — the single source of truth for runtime
 * scaffold selection. Only scaffolds listed in ALL_SCAFFOLDS are used
 * by matchScaffoldWithEmbeddings() during code generation.
 *
 * External Vercel templates (_template_refs/, vercel_template_cli.py)
 * are research/reference material for creating new internal scaffolds.
 * They are NOT used at runtime and have no connection to this registry.
 */
import type { ScaffoldManifest, ScaffoldFamily } from "./types";
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

const ALL_SCAFFOLDS: ScaffoldManifest[] = BASE_SCAFFOLDS.map((scaffold) => ({
  ...scaffold,
  ...getScaffoldResearchOverrides(scaffold.id),
}));

export function getScaffoldById(id: string): ScaffoldManifest | null {
  return ALL_SCAFFOLDS.find((s) => s.id === id) ?? null;
}

export function getScaffoldByFamily(family: ScaffoldFamily): ScaffoldManifest | null {
  return ALL_SCAFFOLDS.find((s) => s.family === family) ?? null;
}

export function getAllScaffolds(): ScaffoldManifest[] {
  return ALL_SCAFFOLDS;
}

export function getScaffoldFamilies(): ScaffoldFamily[] {
  return [...new Set(ALL_SCAFFOLDS.map((s) => s.family))];
}
