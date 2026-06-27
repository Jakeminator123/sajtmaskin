import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lightweight guard for the control-plane registries so `test:ci` catches drift
 * without needing the full `control-plane:check` AJV pass. Mirrors the invariants
 * in config/control-plane/README.md.
 */

const REPO_ROOT = process.cwd();

const TYPES = ["schema", "policy", "rule", "runtime-authority"];
const CI_STATUS = ["hard", "warn", "manual", "none"];
const RUNTIME_STATUS = ["wired", "declared-only", "n/a"];
const MOBILITY = ["safe", "risky", "leave"];
const DANGER = ["low", "medium", "high"];

const REQUIRED_KEYS = [
  "id",
  "sourceOfTruth",
  "type",
  "validator",
  "ciStatus",
  "runtimeEnforced",
  "runtimeStatus",
  "backoffice",
  "mobility",
  "notes",
];

type Entry = {
  id: string;
  sourceOfTruth: string;
  type: string;
  validator: string | null;
  validatorWaiver?: string;
  ciStatus: string;
  runtimeEnforced: boolean;
  runtimeStatus: string;
  backoffice: { surface: string | null; editable: boolean; writePath: string | null; danger: string };
  mobility: string;
  notes: string;
};

type Registry = { schemaVersion: number; entries: Entry[] };

function loadRegistry(relPath: string): Registry {
  return JSON.parse(readFileSync(join(REPO_ROOT, relPath), "utf8")) as Registry;
}

const REGISTRIES: Array<{ name: string; file: string; requiredIds: string[] }> = [
  {
    name: "schema-registry",
    file: "config/control-plane/schema-registry.json",
    requiredIds: [
      "ai-models-manifest",
      "env-server-schema",
      "db-schema",
      "dossier-manifest-schema",
      "control-plane-registry-schema",
    ],
  },
  {
    name: "policy-registry",
    file: "config/control-plane/policy-registry.json",
    requiredIds: ["env-policy", "manifest-repair-policies", "manifest-per-tier-timeouts", "agent-rules"],
  },
];

describe.each(REGISTRIES)("control-plane $name", ({ file, requiredIds }) => {
  const registry = loadRegistry(file);

  it("parses with schemaVersion 1 and a non-empty entries array", () => {
    expect(registry.schemaVersion).toBe(1);
    expect(Array.isArray(registry.entries)).toBe(true);
    expect(registry.entries.length).toBeGreaterThan(0);
  });

  it("has unique kebab-case ids", () => {
    const ids = registry.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("each entry has the required keys and valid enum values", () => {
    for (const entry of registry.entries) {
      for (const key of REQUIRED_KEYS) {
        expect(entry, `entry ${entry.id} missing ${key}`).toHaveProperty(key);
      }
      expect(TYPES).toContain(entry.type);
      expect(CI_STATUS).toContain(entry.ciStatus);
      expect(RUNTIME_STATUS).toContain(entry.runtimeStatus);
      expect(MOBILITY).toContain(entry.mobility);
      expect(typeof entry.runtimeEnforced).toBe("boolean");
      expect(DANGER).toContain(entry.backoffice.danger);
      expect(typeof entry.backoffice.editable).toBe("boolean");

      // hard gate must carry a validator
      if (entry.ciStatus === "hard") expect(entry.validator).not.toBeNull();
      // declared/unenforced entries must explain themselves
      if (entry.runtimeEnforced === false) expect(entry.notes.trim().length).toBeGreaterThan(0);
      // runtime-wired entries must carry a validator OR an explicit waiver, so a
      // runtime-enforced editable policy can never ship with no structural guarantee
      if (entry.runtimeEnforced === true && entry.validator === null) {
        expect(
          (entry.validatorWaiver ?? "").trim().length,
          `entry ${entry.id} is runtimeEnforced with no validator and no validatorWaiver`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("referenced non-glob sourceOfTruth base files exist on disk", () => {
    for (const entry of registry.entries) {
      const base = entry.sourceOfTruth.split("#")[0];
      if (base.includes("*")) continue; // globs covered by control-plane:check
      expect(existsSync(join(REPO_ROOT, base)), `missing ${base} for ${entry.id}`).toBe(true);
    }
  });

  // #202: a `file.json#fragment` reference must resolve to a defined key, not
  // just an existing base file — otherwise a renamed/typo'd fragment is a
  // silent false-green. Mirrors resolveSource() in check-registry.mjs.
  it("JSON #fragment sourceOfTruth references resolve to a defined key", () => {
    for (const entry of registry.entries) {
      const hashIdx = entry.sourceOfTruth.indexOf("#");
      if (hashIdx === -1) continue;
      const base = entry.sourceOfTruth.slice(0, hashIdx);
      const fragment = entry.sourceOfTruth.slice(hashIdx + 1);
      if (base.includes("*") || !/\.jsonc?$/i.test(base)) continue;
      const json = JSON.parse(readFileSync(join(REPO_ROOT, base), "utf8")) as unknown;
      let node: unknown = json;
      for (const key of fragment.split(".")) {
        const present =
          node != null &&
          typeof node === "object" &&
          Object.prototype.hasOwnProperty.call(node, key);
        expect(present, `fragment #${fragment} missing in ${base} for ${entry.id}`).toBe(true);
        node = (node as Record<string, unknown>)[key];
      }
    }
  });

  it("includes the known-authority ids", () => {
    const ids = new Set(registry.entries.map((e) => e.id));
    for (const requiredId of requiredIds) {
      expect(ids.has(requiredId), `missing known-authority id ${requiredId}`).toBe(true);
    }
  });
});
