import type { ScaffoldManifest, ScaffoldFamily } from "./types";
import { baseNextjsManifest } from "./base-nextjs/manifest";
import { contentSiteManifest } from "./content-site/manifest";
import { appShellManifest } from "./app-shell/manifest";

const ALL_SCAFFOLDS: ScaffoldManifest[] = [
  baseNextjsManifest,
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
