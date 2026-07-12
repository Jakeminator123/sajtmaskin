/**
 * Regenerate `data/dossiers/_index/capability-map.json` from disk.
 *
 * Walks `data/dossiers/{hard,soft}/<id>/manifest.json` and builds a view of
 * capability → [dossier-id]. This file is consumed by the backoffice Dossiers
 * page + curation docs; the runtime selector walks disk directly and does not
 * read this file.
 *
 * Usage:
 *   npx tsx scripts/dossiers/regenerate-capability-map.ts         # check-only (prints diff)
 *   npx tsx scripts/dossiers/regenerate-capability-map.ts --write # regenerate + write
 *
 * Exit codes:
 *   0 = map is in sync (no changes needed)
 *   1 = map is stale (differs from disk) — use --write to refresh
 *   2 = fatal error (invalid manifest, missing directory, etc.)
 *
 * Hook this into CI and/or pre-commit so the on-disk file never drifts.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { DOSSIER_GROUP_ORDER, resolveDossierGroup } from "../../src/lib/builder/dossier-groups";

const ROOT = resolve(process.cwd(), "data", "dossiers");
const INDEX_DIR = join(ROOT, "_index");
const MAP_PATH = join(INDEX_DIR, "capability-map.json");
const CLASSES = ["hard", "soft"] as const;

type CapabilityGroupView = {
  label: string;
  capabilities: string[];
};

type CapabilityMap = {
  $comment: string;
  generatedAt: string;
  capabilities: Record<string, string[]>;
  groups: Record<string, CapabilityGroupView>;
};

/**
 * Presentation-only grouping of the live capability pool, derived from the
 * canonical `dossier-groups.ts` map (`DOSSIER_GROUP_ORDER` / `resolveDossierGroup`).
 * Keeps backoffice (Python) from needing its own hand-written copy of the
 * capability→group mapping — see `docs/contracts/dossier-system.md` § Grupper.
 */
function buildGroups(capabilities: Record<string, string[]>): Record<string, CapabilityGroupView> {
  const groups: Record<string, CapabilityGroupView> = {};
  for (const group of DOSSIER_GROUP_ORDER) {
    groups[group.id] = { label: group.label, capabilities: [] };
  }
  for (const capability of Object.keys(capabilities).sort()) {
    const group = resolveDossierGroup(capability);
    groups[group.id].capabilities.push(capability);
  }
  return groups;
}

function listIds(klass: string): string[] {
  const dir = join(ROOT, klass);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort();
}

function readManifestCapability(klass: string, id: string): string | null {
  const manifestPath = join(ROOT, klass, id, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`[capability-map] missing manifest: ${klass}/${id}/manifest.json`);
    process.exit(2);
  }
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    const cap = parsed.capability;
    return typeof cap === "string" && cap.trim().length > 0 ? cap.trim() : null;
  } catch (err) {
    console.error(
      `[capability-map] invalid JSON in ${klass}/${id}/manifest.json: ${
        err instanceof Error ? err.message : err
      }`,
    );
    process.exit(2);
  }
}

function collectCapabilities(): Record<string, string[]> {
  const byCap: Record<string, string[]> = {};
  for (const klass of CLASSES) {
    for (const id of listIds(klass)) {
      const capability = readManifestCapability(klass, id);
      if (!capability) {
        console.warn(`[capability-map] ${klass}/${id}: missing capability — skipped`);
        continue;
      }
      (byCap[capability] ??= []).push(id);
    }
  }
  // Deterministic output: sort capability keys + dossier ids within each.
  const sorted: Record<string, string[]> = {};
  for (const cap of Object.keys(byCap).sort()) {
    sorted[cap] = [...byCap[cap]].sort();
  }
  return sorted;
}

function readExistingMap(): CapabilityMap | null {
  if (!existsSync(MAP_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(MAP_PATH, "utf-8")) as CapabilityMap;
    return parsed;
  } catch {
    return null;
  }
}

function sameCapabilities(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.join(",") !== bKeys.join(",")) return false;
  for (const k of aKeys) {
    if ((a[k] ?? []).join(",") !== (b[k] ?? []).join(",")) return false;
  }
  return true;
}

/**
 * Check-mode must also catch a stale/missing `groups` view (e.g. after a
 * `dossier-groups.ts` change without --write) — capabilities alone matching
 * is not "in sync" anymore.
 */
function sameGroups(
  existing: Record<string, CapabilityGroupView> | undefined,
  fresh: Record<string, CapabilityGroupView>,
): boolean {
  if (!existing || typeof existing !== "object") return false;
  return JSON.stringify(existing) === JSON.stringify(fresh);
}

function main(): void {
  const writeMode = process.argv.includes("--write");
  const capabilities = collectCapabilities();
  const existing = readExistingMap();
  const dossierCount = Object.values(capabilities).flat().length;

  if (dossierCount === 0 || Object.keys(capabilities).length === 0) {
    console.error("[capability-map] no dossiers/capabilities found under data/dossiers/{hard,soft}");
    process.exit(2);
  }

  const freshGroups = buildGroups(capabilities);

  if (
    existing &&
    sameCapabilities(existing.capabilities, capabilities) &&
    sameGroups(existing.groups, freshGroups) &&
    !writeMode
  ) {
    console.log(
      `[capability-map] in sync (${Object.keys(capabilities).length} capabilities across ${
        dossierCount
      } dossiers)`,
    );
    process.exit(0);
  }

  if (!writeMode) {
    console.error("[capability-map] OUT OF SYNC with disk.");
    if (existing) {
      const existingKeys = new Set(Object.keys(existing.capabilities));
      const diskKeys = new Set(Object.keys(capabilities));
      const added = [...diskKeys].filter((k) => !existingKeys.has(k));
      const removed = [...existingKeys].filter((k) => !diskKeys.has(k));
      if (added.length) console.error(`  Added on disk: ${added.join(", ")}`);
      if (removed.length) console.error(`  Removed on disk: ${removed.join(", ")}`);
      if (!sameGroups(existing.groups, freshGroups)) {
        console.error("  `groups` view is missing or stale vs src/lib/builder/dossier-groups.ts.");
      }
    } else {
      console.error("  (no existing capability-map.json found)");
    }
    console.error("Run with --write to regenerate.");
    process.exit(1);
  }

  if (!existsSync(INDEX_DIR)) {
    mkdirSync(INDEX_DIR, { recursive: true });
  }
  const next: CapabilityMap = {
    $comment:
      "View of capability → dossier ids, plus a `groups` view (capability → presentation group, derived from src/lib/builder/dossier-groups.ts) for the backoffice group view. Can be regenerated from either backoffice/pages/dossiers.py (Capability map tab → 'Bygg om') or `npm run dossiers:capability-map:write` (scripts/dossiers/regenerate-capability-map.ts). Runtime walks data/dossiers/{hard,soft}/ directly; this file is for tooling + sanity check during curation.",
    generatedAt: new Date().toISOString(),
    capabilities,
    groups: freshGroups,
  };
  writeFileSync(MAP_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  console.log(
    `[capability-map] wrote ${MAP_PATH} (${Object.keys(capabilities).length} capabilities, ${
      dossierCount
    } dossiers)`,
  );
}

main();
