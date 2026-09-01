import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
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
  backoffice: {
    surface: string | null;
    editable: boolean;
    writePath: string | null;
    danger: string;
  };
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
      "backoffice-domain-map-schema",
      "ai-models-manifest",
      "env-server-schema",
      "db-schema",
      "dossier-manifest-schema",
      "scaffold-manifests",
      "embeddings-blob-manifest-schema",
      "variant-template-addenda-schema",
      "control-plane-registry-schema",
      "agent-workflow-schema",
    ],
  },
  {
    name: "policy-registry",
    file: "config/control-plane/policy-registry.json",
    requiredIds: [
      "backoffice-domain-map",
      "env-policy",
      "manifest-repair-policies",
      "manifest-pre-generation-contracts",
      "manifest-per-tier-briefing",
      "embeddings-blob-manifest-runtime",
      "variant-template-addenda-runtime",
      "prompt-heuristic-tokens",
      "tier3-sdk-deny",
      "naming-dictionary",
      "agent-context-policy",
      "agent-workflow-policy",
      "openclaw-builder-prompt-tips",
    ],
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
      if (entry.backoffice.editable) {
        expect(
          entry.backoffice.surface,
          `entry ${entry.id} is editable but has no Backoffice surface`,
        ).not.toBeNull();
        expect(
          entry.backoffice.writePath,
          `entry ${entry.id} is editable but has no Backoffice write path`,
        ).not.toBeNull();
      } else {
        expect(
          entry.backoffice.writePath,
          `entry ${entry.id} is read-only but declares a Backoffice write path`,
        ).toBeNull();
      }

      // hard gate must carry a validator
      if (entry.ciStatus === "hard") expect(entry.validator).not.toBeNull();
      // declared/unenforced entries must explain themselves
      if (entry.runtimeEnforced === false) expect(entry.notes.trim().length).toBeGreaterThan(0);
      expect(
        entry.runtimeEnforced,
        `entry ${entry.id} runtimeEnforced disagrees with runtimeStatus=${entry.runtimeStatus}`,
      ).toBe(entry.runtimeStatus === "wired");
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

describe("control-plane registry schema path safety", () => {
  const schema = JSON.parse(
    readFileSync(join(REPO_ROOT, "docs/schemas/strict/control-plane-registry.schema.json"), "utf8"),
  ) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const baseEntry: Entry = {
    id: "test-owner",
    sourceOfTruth: "src/lib/env.ts",
    type: "runtime-authority",
    validator: "typecheck",
    ciStatus: "hard",
    runtimeEnforced: true,
    runtimeStatus: "wired",
    backoffice: { surface: null, editable: false, writePath: null, danger: "low" },
    mobility: "risky",
    notes: "Fixture owner.",
  };

  function isSchemaValid(entry: Entry): boolean {
    return validate({ schemaVersion: 1, entries: [entry] });
  }

  it("accepts repo-relative owners, JSON fragments and single-segment globs", () => {
    for (const sourceOfTruth of [
      "src/lib/env.ts",
      "config/ai_models/manifest.json#repairPolicies",
      "src/lib/gen/scaffolds/*/manifest.ts",
    ]) {
      expect(isSchemaValid({ ...baseEntry, sourceOfTruth }), sourceOfTruth).toBe(true);
    }
  });

  it.each([
    "C:/outside/owner.ts",
    "/outside/owner.ts",
    "../outside/owner.ts",
    "src/../outside/owner.ts",
    "src\\lib\\env.ts",
    "src/lib/env.ts#missing",
    "src/lib/gen/*.ts#missing",
  ])("rejects unsafe sourceOfTruth %s", (sourceOfTruth) => {
    expect(isSchemaValid({ ...baseEntry, sourceOfTruth })).toBe(false);
  });

  it.each(["C:/outside/file.json", "/outside/file.json", "../outside/file.json", "src\\x.ts"])(
    "rejects unsafe Backoffice writePath %s",
    (writePath) => {
      expect(
        isSchemaValid({
          ...baseEntry,
          backoffice: { surface: "Översikt", editable: true, writePath, danger: "low" },
        }),
      ).toBe(false);
    },
  );
});

describe("control-plane registry coverage", () => {
  const schemaRegistry = loadRegistry("config/control-plane/schema-registry.json");
  const policyRegistry = loadRegistry("config/control-plane/policy-registry.json");

  it("has unique ids across both registries", () => {
    const ids = [...schemaRegistry.entries, ...policyRegistry.entries].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses exact Backoffice PAGE_SPECS names for every declared surface", () => {
    // Parse the declarative PageSpec names without importing backoffice.pages:
    // that module imports Streamlit page implementations and would turn this
    // metadata test into an environment-dependent UI smoke test.
    const pageRegistry = readFileSync(join(REPO_ROOT, "backoffice/pages/__init__.py"), "utf8");
    const pageNames = new Set(
      [...pageRegistry.matchAll(/PageSpec\((?:\s|#[^\r\n]*(?:\r?\n|$))*["']([^"']+)["']/g)].map(
        (match) => match[1],
      ),
    );
    expect(pageNames.size).toBe(37);
    expect(pageNames.has("Scaffold-poäng")).toBe(true);
    for (const entry of [...schemaRegistry.entries, ...policyRegistry.entries]) {
      const surface = entry.backoffice.surface;
      if (surface === null) continue;
      expect(
        pageNames.has(surface),
        `${entry.id} names unknown Backoffice surface ${surface}`,
      ).toBe(true);
    }
  });

  it("gives every strict schema/spec exactly one explicit owner row", () => {
    const strictSources = readdirSync(join(REPO_ROOT, "docs/schemas/strict"))
      .filter((name) => name.endsWith(".schema.json"))
      .map((name) => `docs/schemas/strict/${name}`)
      .sort();
    const sourceCounts = new Map<string, number>();
    for (const entry of schemaRegistry.entries) {
      const source = entry.sourceOfTruth.split("#")[0];
      if (!source.startsWith("docs/schemas/strict/") || source.includes("*")) continue;
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    }
    for (const source of strictSources) {
      expect(sourceCounts.get(source), `${source} must have exactly one registry row`).toBe(1);
    }
    expect([...sourceCounts.keys()].sort()).toEqual(strictSources);
  });

  it.each([
    [
      "config/embeddings-blob-manifest.json",
      "docs/schemas/strict/embeddings-blob-manifest.schema.json",
    ],
    [
      "config/variant-template-addenda.json",
      "docs/schemas/strict/variant-template-addenda.schema.json",
    ],
  ])("keeps %s valid against its strict JSON Schema mirror", (dataPath, schemaPath) => {
    const data = JSON.parse(readFileSync(join(REPO_ROOT, dataPath), "utf8")) as object;
    const schema = JSON.parse(readFileSync(join(REPO_ROOT, schemaPath), "utf8")) as object;
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    expect(validate(data), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});

describe("owner decision register", () => {
  const decisions = readFileSync(join(REPO_ROOT, "docs/decisions/README.md"), "utf8");
  function parseDecisionRow(line: string): string[] {
    const cells: string[] = [];
    let cell = "";
    let escaped = false;
    for (const char of line.slice(1, -1)) {
      if (escaped) {
        cell += char;
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "|") {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += char;
      }
    }
    if (escaped) cell += "\\";
    cells.push(cell.trim());
    return cells;
  }

  function decisionRowErrors(line: string): string[] {
    const cells = parseDecisionRow(line);
    const errors: string[] = [];
    if (cells.length !== 4) errors.push(`expected 4 cells, found ${cells.length}`);
    const source = cells[3] ?? "";
    if (!source) errors.push("canonical source is empty");
    if (source.toLowerCase() === "samma") errors.push("canonical source is shorthand");
    if (!/\[[^\]]+\]\((?:\.\.\/)+[^)]+\)/.test(source)) {
      errors.push("canonical source must contain a repo-relative Markdown link");
    }
    if (/(?:^|\/)plans\/(?:active|archived|avklarat)(?:\/|\))/.test(source)) {
      errors.push("canonical source points at plan history");
    }
    if (source.includes("BUG-SWARM-BACKLOG.md")) errors.push("canonical source is backlog");
    return errors;
  }

  const decisionRows = decisions
    .split(/\r?\n/)
    .filter((line) => /^\| 20\d\d-\d\d-\d\d \|/.test(line));

  it("points current decisions at canonical owners rather than shorthand or work queues", () => {
    for (const row of decisionRows) {
      expect(decisionRowErrors(row), `invalid canonical decision source: ${row}`).toEqual([]);
    }
  });

  it("rejects malformed, empty, arbitrary and queue-owned canonical sources", () => {
    const invalidRows = [
      "| 2026-08-12 | Test | Decision | |",
      "| 2026-08-12 | Test | Decision | arbitrary prose |",
      "| 2026-08-12 | Test | Decision | [`plan`](../plans/active/example.md) |",
      "| 2026-08-12 | Test | Decision | [`plan`](../../docs/plans/archived/example.md) |",
      "| 2026-08-12 | Test | Decision | [`plan`](../plans/avklarat/README.md) |",
      "| 2026-08-12 | Test | Decision | [`queue`](../../BUG-SWARM-BACKLOG.md) |",
      "| 2026-08-12 | Test | Decision with an unescaped | pipe | [`owner`](../../src/x.ts) |",
    ];
    for (const row of invalidRows) {
      expect(decisionRowErrors(row).length, `${row} should be forbidden`).toBeGreaterThan(0);
    }
  });

  it("accepts multiple repo-relative owner links and escaped table pipes", () => {
    const row =
      "| 2026-08-12 | Test | Decision with an escaped \\| separator | [`owner`](../../src/x.ts) + [`contract`](../contracts/x.md) |";
    expect(decisionRowErrors(row)).toEqual([]);
  });

  it("keeps delivery history out and records the current cleanup ownership decisions", () => {
    expect(decisions).not.toContain("| Leveransordning");
    expect(decisions).toContain("| Backoffice-karta");
    expect(decisions).toContain("| Ordlista/validering");
    expect(decisions).toContain("| Städning/legacy");
    expect(decisions).toContain("| Konfigurationsyta");
  });
});

describe("control-plane Backoffice and CI truth", () => {
  const policyRegistry = loadRegistry("config/control-plane/policy-registry.json");
  const schemaRegistry = loadRegistry("config/control-plane/schema-registry.json");
  const byId = new Map(policyRegistry.entries.map((entry) => [entry.id, entry]));
  const schemaById = new Map(schemaRegistry.entries.map((entry) => [entry.id, entry]));

  it("points Codegen policies and schemas at their real editor", () => {
    expect(byId.get("domain-rules")?.backoffice).toMatchObject({
      surface: "Codegen core",
      editable: true,
      writePath: "config/domain-rules.json",
    });
    expect(byId.get("prompt-heuristic-tokens")?.backoffice).toMatchObject({
      surface: "Codegen core",
      editable: true,
      writePath: "config/prompt-heuristic-tokens.json",
    });
    for (const id of ["domain-rules-schema", "prompt-heuristic-tokens-schema"]) {
      expect(schemaById.get(id)?.backoffice).toMatchObject({
        surface: "Codegen core",
        editable: false,
        writePath: null,
      });
    }
  });

  it("points scaffold manifests at their real Backoffice editor", () => {
    expect(schemaById.get("scaffold-manifests")?.backoffice).toMatchObject({
      surface: "Scaffolds: titta & justera",
      editable: true,
      writePath: "src/lib/gen/scaffolds/*/manifest.ts",
    });
  });

  it("distinguishes the editable AI manifest from its read-only schema mirror", () => {
    expect(schemaById.get("ai-models-manifest-jsonschema")?.backoffice).toMatchObject({
      surface: "ai_models",
      editable: false,
      writePath: null,
    });
    expect(byId.get("manifest-per-tier-briefing")?.backoffice).toMatchObject({
      surface: "ai_models",
      editable: true,
      writePath: "config/ai_models/manifest.json",
    });
  });

  it("keeps read-only policies out of the editor map", () => {
    for (const id of ["tier3-sdk-deny", "naming-dictionary"]) {
      expect(byId.get(id)?.backoffice).toMatchObject({
        surface: null,
        editable: false,
        writePath: null,
      });
    }
  });

  it("records the blocking terminology contract", () => {
    expect(byId.get("naming-dictionary")).toMatchObject({
      validator: "check:terms:contract",
      ciStatus: "hard",
      runtimeEnforced: false,
      runtimeStatus: "n/a",
    });
  });

  it("records the user degraded-env editor without claiming runtime wiring", () => {
    expect(byId.get("user-degraded-env")).toMatchObject({
      runtimeEnforced: false,
      runtimeStatus: "declared-only",
      backoffice: {
        surface: "user_degraded_env",
        editable: true,
        writePath: "config/user_degraded_env.txt",
      },
    });
  });
});
