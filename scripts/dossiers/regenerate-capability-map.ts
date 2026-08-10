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
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

import { DOSSIER_GROUP_ORDER, resolveDossierGroup } from "../../src/lib/builder/dossier-groups";
import { getAllDossiers } from "../../src/lib/gen/dossiers/registry";
import { dossierRequiresF3, type DossierEntry } from "../../src/lib/gen/dossiers/types";
import { getF2MutedIntegrationCapabilities } from "../../src/lib/gen/orchestrate/capability-prompt-filter";

const ROOT = resolve(process.cwd(), "data", "dossiers");
const INDEX_DIR = join(ROOT, "_index");
const MAP_PATH = join(INDEX_DIR, "capability-map.json");
const CLASSES = ["hard", "soft"] as const;
const REPO_ROOT = resolve(process.cwd());
const FIXED_SOURCE_PATHS = [
  "docs/schemas/strict/dossier.schema.json",
  "scripts/dossiers/regenerate-capability-map.ts",
  "src/lib/builder/dossier-groups.ts",
  "src/lib/gen/dossiers/registry.ts",
  "src/lib/gen/dossiers/types.ts",
  "src/lib/gen/dossiers/validate-manifest.ts",
  "src/lib/gen/orchestrate/capability-prompt-filter.ts",
] as const;

type CapabilityGroupView = {
  label: string;
  capabilities: string[];
};

type DossierTruthView = {
  id: string;
  label: string;
  class: DossierEntry["class"];
  capability: string;
  providers: string[];
  defaultForCapability: boolean;
  mock: NonNullable<DossierEntry["mock"]> | "none";
  envVars: Array<{
    key: string;
    required: boolean;
    enforcement: "build" | "feature-runtime" | "warn-only";
  }>;
  fileRoles: Record<string, number>;
  dependencies: string[];
  summarySv: string;
  verificationStatus: "accepted" | "unverified";
  lastVerified: string;
  f2Disposition: "available" | "deferred";
  f2Reason: "available" | "build-server" | "policy-only";
  buildServerRequirement: boolean;
  buildServerReasons: Array<"build-env" | "server-file">;
};

type CapabilityMap = {
  $comment: string;
  generatedAt: string;
  capabilities: Record<string, string[]>;
  groups: Record<string, CapabilityGroupView>;
  dossiers: DossierTruthView[];
  f2Policy: {
    mutedCapabilities: string[];
  };
  sourceFiles: Record<string, string>;
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function collectSourceFiles(): Record<string, string> {
  const manifestPaths = CLASSES.flatMap((klass) =>
    listIds(klass).map((id) => `data/dossiers/${klass}/${id}/manifest.json`),
  );
  return Object.fromEntries(
    [...FIXED_SOURCE_PATHS, ...manifestPaths]
      .sort()
      .map((relativePath) => [relativePath, sha256File(join(REPO_ROOT, relativePath))]),
  );
}

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

function collectCapabilities(dossiers: readonly DossierEntry[]): Record<string, string[]> {
  const byCap: Record<string, string[]> = {};
  for (const dossier of dossiers) {
    (byCap[dossier.capability] ??= []).push(dossier.id);
  }
  // Deterministic output: sort capability keys + dossier ids within each.
  const sorted: Record<string, string[]> = {};
  for (const cap of Object.keys(byCap).sort()) {
    sorted[cap] = [...byCap[cap]].sort();
  }
  return sorted;
}

function buildDossierTruth(
  dossiers: readonly DossierEntry[],
  f2MutedCapabilities: ReadonlySet<string>,
): DossierTruthView[] {
  return dossiers
    .map((dossier) => {
      const fileRoles: Record<string, number> = {};
      for (const file of dossier.files ?? []) {
        fileRoles[file.role] = (fileRoles[file.role] ?? 0) + 1;
      }
      const buildServerRequirement = dossierRequiresF3(dossier);
      const buildServerReasons: DossierTruthView["buildServerReasons"] = [];
      if ((dossier.envVars ?? []).some((envVar) => (envVar.enforcement ?? "build") === "build")) {
        buildServerReasons.push("build-env");
      }
      if ((dossier.files ?? []).some((file) => file.role === "server")) {
        buildServerReasons.push("server-file");
      }
      const f2Deferred = f2MutedCapabilities.has(dossier.capability);
      return {
        id: dossier.id,
        label: dossier.label,
        class: dossier.class,
        capability: dossier.capability,
        providers: [...(dossier.providers ?? [])].sort(),
        defaultForCapability: dossier.defaultForCapability,
        mock: dossier.mock ?? "none",
        envVars: (dossier.envVars ?? [])
          .map((envVar) => ({
            key: envVar.key,
            required: envVar.required,
            enforcement: envVar.enforcement ?? "build",
          }))
          .sort((left, right) => left.key.localeCompare(right.key)),
        fileRoles: Object.fromEntries(
          Object.entries(fileRoles).sort(([left], [right]) => left.localeCompare(right)),
        ),
        dependencies: [...(dossier.dependencies ?? [])].sort(),
        summarySv: dossier.summarySv ?? dossier.summary,
        verificationStatus: dossier.verificationStatus ?? "accepted",
        lastVerified: dossier.lastVerified,
        f2Disposition: f2Deferred ? "deferred" : "available",
        f2Reason: f2Deferred
          ? buildServerRequirement
            ? "build-server"
            : "policy-only"
          : "available",
        buildServerRequirement,
        buildServerReasons,
      };
    })
    .sort(
      (left, right) => left.class.localeCompare(right.class) || left.id.localeCompare(right.id),
    );
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

function sameDossiers(
  existing: DossierTruthView[] | undefined,
  fresh: DossierTruthView[],
): boolean {
  return JSON.stringify(existing) === JSON.stringify(fresh);
}

function sameF2Policy(
  existing: CapabilityMap["f2Policy"] | undefined,
  fresh: CapabilityMap["f2Policy"],
): boolean {
  return JSON.stringify(existing) === JSON.stringify(fresh);
}

function sameSourceFiles(
  existing: Record<string, string> | undefined,
  fresh: Record<string, string>,
): boolean {
  return JSON.stringify(existing) === JSON.stringify(fresh);
}

function main(): void {
  const writeMode = process.argv.includes("--write");
  const dossiers = getAllDossiers();
  const diskCount = CLASSES.reduce((count, klass) => count + listIds(klass).length, 0);
  if (dossiers.length !== diskCount) {
    console.error(
      `[capability-map] runtime registry accepted ${dossiers.length} of ${diskCount} dossier directories. Fix the rejected manifest(s) before regenerating.`,
    );
    process.exit(2);
  }
  const capabilities = collectCapabilities(dossiers);
  const existing = readExistingMap();
  const dossierCount = Object.values(capabilities).flat().length;

  if (dossierCount === 0 || Object.keys(capabilities).length === 0) {
    console.error(
      "[capability-map] no dossiers/capabilities found under data/dossiers/{hard,soft}",
    );
    process.exit(2);
  }

  const freshGroups = buildGroups(capabilities);
  const f2MutedCapabilities = getF2MutedIntegrationCapabilities();
  const freshDossiers = buildDossierTruth(dossiers, f2MutedCapabilities);
  const freshF2Policy: CapabilityMap["f2Policy"] = {
    mutedCapabilities: [...f2MutedCapabilities].sort(),
  };
  const freshSourceFiles = collectSourceFiles();

  if (
    existing &&
    sameCapabilities(existing.capabilities, capabilities) &&
    sameGroups(existing.groups, freshGroups) &&
    sameDossiers(existing.dossiers, freshDossiers) &&
    sameF2Policy(existing.f2Policy, freshF2Policy) &&
    sameSourceFiles(existing.sourceFiles, freshSourceFiles)
  ) {
    console.log(
      `[capability-map] ${writeMode ? "already in sync; no write needed" : "in sync"} (${Object.keys(capabilities).length} capabilities across ${
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
      if (!sameDossiers(existing.dossiers, freshDossiers)) {
        console.error(
          "  `dossiers` truth view is missing or stale vs the validated runtime registry.",
        );
      }
      if (!sameF2Policy(existing.f2Policy, freshF2Policy)) {
        console.error(
          "  `f2Policy` view is missing or stale vs getF2MutedIntegrationCapabilities().",
        );
      }
      if (!sameSourceFiles(existing.sourceFiles, freshSourceFiles)) {
        console.error("  `sourceFiles` fingerprints are missing or stale.");
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
      "Generated tooling projection from the validated runtime registry: dossier facts, capability → dossier ids, presentation groups from src/lib/builder/dossier-groups.ts, and the F2 integration-mute from getF2MutedIntegrationCapabilities(). Can be regenerated automatically by backoffice/pages/dossiers.py or explicitly with `npm run dossiers:capability-map:write`. Runtime walks data/dossiers/{hard,soft}/ directly; this file is not a runtime owner.",
    generatedAt: new Date().toISOString(),
    capabilities,
    groups: freshGroups,
    dossiers: freshDossiers,
    f2Policy: freshF2Policy,
    sourceFiles: freshSourceFiles,
  };
  writeFileSync(MAP_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  console.log(
    `[capability-map] wrote ${MAP_PATH} (${Object.keys(capabilities).length} capabilities, ${
      dossierCount
    } dossiers)`,
  );
}

main();
