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

const ALL_SCAFFOLDS: ScaffoldManifest[] = [
  baseNextjsManifest,
  landingPageManifest,
  saasLandingManifest,
  portfolioManifest,
  blogManifest,
  dashboardManifest,
  authPagesManifest,
  contentSiteManifest,
  appShellManifest,
];

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
