/**
 * @vitest-environment node
 *
 * Contract tests for the generated dossier projection
 * (`data/dossiers/_index/capability-map.json`).
 *
 * These import the generator's real builders instead of re-deriving the rules,
 * so the test can never drift into being a second copy of the policy. The
 * freshness case is the local twin of the blocking CI step
 * (`npm run dossiers:capability-map:check`).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getF2MutedIntegrationCapabilities } from "../../src/lib/gen/dossiers/f2-mute";
import { getAllDossiers } from "../../src/lib/gen/dossiers/registry";
import {
  FIXED_SOURCE_PATHS,
  MAP_PATH,
  buildDossierTruth,
  buildGroups,
  collectCapabilities,
  collectSourceFiles,
  listIds,
  type CapabilityMap,
} from "./regenerate-capability-map";

const TRUTH_VIEW_KEYS = [
  "id",
  "label",
  "class",
  "capability",
  "providers",
  "defaultForCapability",
  "mock",
  "envVars",
  "fileRoles",
  "dependencies",
  "summarySv",
  "verificationStatus",
  "lastVerified",
  "f2Disposition",
  "f2Reason",
  "buildServerRequirement",
  "buildServerReasons",
].sort();

const dossiers = getAllDossiers();
const mutedCapabilities = getF2MutedIntegrationCapabilities();
const truth = buildDossierTruth(dossiers, mutedCapabilities);
const committed = JSON.parse(readFileSync(MAP_PATH, "utf-8")) as CapabilityMap;

describe("capability-map projection: truth view", () => {
  it("exposes exactly the documented field set for every dossier", () => {
    expect(truth.length).toBeGreaterThan(0);
    for (const entry of truth) {
      expect(Object.keys(entry).sort()).toEqual(TRUTH_VIEW_KEYS);
    }
  });

  it("keeps F2 disposition and the build/server contract as separate axes", () => {
    // If these two columns ever collapse into one derivation, at least one of
    // these groups goes empty — that is the regression this locks.
    const deferredWithoutBuildServer = truth.filter(
      (entry) => entry.f2Disposition === "deferred" && !entry.buildServerRequirement,
    );
    const deferredWithBuildServer = truth.filter(
      (entry) => entry.f2Disposition === "deferred" && entry.buildServerRequirement,
    );
    expect(deferredWithoutBuildServer.length).toBeGreaterThan(0);
    expect(deferredWithBuildServer.length).toBeGreaterThan(0);
  });

  it("keeps vercel-analytics as the control case: deferred in F2, no build/server need", () => {
    const analytics = truth.find((entry) => entry.id === "vercel-analytics");
    expect(analytics).toBeDefined();
    expect(analytics).toMatchObject({
      capability: "analytics",
      f2Disposition: "deferred",
      f2Reason: "policy-only",
      buildServerRequirement: false,
      buildServerReasons: [],
    });
  });

  it("reports build/server reasons only when the contract actually demands them", () => {
    for (const entry of truth) {
      if (entry.buildServerReasons.length > 0) {
        expect(entry.buildServerRequirement).toBe(true);
      }
      expect(entry.f2Reason === "build-server").toBe(
        entry.f2Disposition === "deferred" && entry.buildServerRequirement,
      );
      if (entry.f2Disposition === "available") {
        expect(entry.f2Reason).toBe("available");
      }
    }
  });
});

describe("capability-map projection: determinism", () => {
  it("sorts the truth view by class then id regardless of registry order", () => {
    const reversed = buildDossierTruth([...dossiers].reverse(), mutedCapabilities);
    expect(reversed).toEqual(truth);
    const order = truth.map((entry) => `${entry.class}/${entry.id}`);
    expect(order).toEqual([...order].sort());
  });

  it("sorts every list-valued field inside an entry", () => {
    for (const entry of truth) {
      expect(entry.providers).toEqual([...entry.providers].sort());
      expect(entry.dependencies).toEqual([...entry.dependencies].sort());
      expect(entry.envVars.map((envVar) => envVar.key)).toEqual(
        [...entry.envVars.map((envVar) => envVar.key)].sort(),
      );
      expect(Object.keys(entry.fileRoles)).toEqual([...Object.keys(entry.fileRoles)].sort());
    }
  });

  it("sorts capability keys and the dossier ids within each capability", () => {
    const capabilities = collectCapabilities(dossiers);
    expect(Object.keys(capabilities)).toEqual([...Object.keys(capabilities)].sort());
    for (const ids of Object.values(capabilities)) {
      expect(ids).toEqual([...ids].sort());
    }
    expect(collectCapabilities([...dossiers].reverse())).toEqual(capabilities);
  });
});

describe("capability-map projection: source fingerprints", () => {
  it("fingerprints only files that exist, in sorted order", () => {
    expect([...FIXED_SOURCE_PATHS]).toEqual([...FIXED_SOURCE_PATHS].sort());
    const fingerprints = collectSourceFiles();
    for (const path of FIXED_SOURCE_PATHS) {
      expect(fingerprints[path]).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("fingerprints the canonical F2-mute owner, not the prompt filter", () => {
    // The generator must stay importable from a plain tsx run; pulling the mute
    // from orchestrate/capability-prompt-filter.ts dragged ~98 modules
    // (build-spec, autofix, capability-inference) into the script.
    expect(FIXED_SOURCE_PATHS).toContain("src/lib/gen/dossiers/f2-mute.ts");
    expect(FIXED_SOURCE_PATHS).not.toContain(
      "src/lib/gen/orchestrate/capability-prompt-filter.ts",
    );
  });

  it("hashes LF-only bytes so Windows and Linux CI agree", () => {
    // `.gitattributes` pins the working tree to `* text=auto eol=lf`. A file
    // that sneaks in with CRLF would hash differently on the two platforms and
    // make the CI staleness gate unfixable-red for Windows contributors.
    for (const path of FIXED_SOURCE_PATHS) {
      expect(readFileSync(path, "utf-8"), `${path} must not contain CRLF`).not.toMatch(/\r\n/);
    }
  });
});

describe("capability-map projection: committed file is fresh", () => {
  it("accepts every dossier directory on disk (registry-vs-disk guard)", () => {
    const diskCount = ["hard", "soft"].reduce((count, klass) => count + listIds(klass).length, 0);
    expect(dossiers.length).toBe(diskCount);
  });

  it("matches the freshly derived views", () => {
    const capabilities = collectCapabilities(dossiers);
    expect(committed.capabilities).toEqual(capabilities);
    expect(committed.groups).toEqual(buildGroups(capabilities));
    expect(committed.dossiers).toEqual(truth);
    expect(committed.f2Policy).toEqual({
      mutedCapabilities: [...mutedCapabilities].sort(),
    });
    expect(committed.sourceFiles).toEqual(collectSourceFiles());
  });

  it("records one fingerprint per dossier manifest", () => {
    const manifestKeys = Object.keys(committed.sourceFiles).filter((key) =>
      key.startsWith("data/dossiers/"),
    );
    expect(manifestKeys.length).toBe(dossiers.length);
  });
});
