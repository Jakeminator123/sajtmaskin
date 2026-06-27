/**
 * env-policy ↔ serverSchema parity + strict-schema validity (Plan B #5).
 *
 * Two guarantees, both CI-gated via `test:ci`:
 *
 *  1. `config/env-policy.json` stays structurally valid against
 *     `docs/schemas/strict/env-policy.schema.json` (the same schema the
 *     backoffice Env Policy editor validates against on save).
 *
 *  2. The env *governance* layer (env-policy.json) never drifts from the env
 *     *runtime* source of truth (the Zod `serverSchema` in src/lib/env.ts):
 *       - every key the app actually reads (serverSchema) receives an
 *         intentional classification from `getEnvRule` — never the generic
 *         catch-all — so a newly-added env var can't silently ship ungoverned;
 *       - every rule marked `shared_runtime` (app-critical across envs) really
 *         is a key the app reads (present in serverSchema), so the policy can't
 *         claim an app dependency the runtime schema doesn't back.
 *
 * This is the concrete answer to "env-policy.json looks like the runtime
 * contract but src/lib/env.ts is": the test pins env.ts as authority.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { serverSchema } from "@/lib/env";
import { getEnvRule } from "@/lib/env-audit";
import envPolicy from "../../config/env-policy.json";

const REPO_ROOT = join(__dirname, "..", "..");

const schema = JSON.parse(
  readFileSync(join(REPO_ROOT, "docs/schemas/strict/env-policy.schema.json"), "utf8"),
) as object;

// Mirrors the final catch-all branch in getEnvRule (src/lib/env-audit.ts): a
// key landing here has no explicit rule AND matches no intentional heuristic.
const CATCHALL_NOTE = "Ingen specialregel definierad; verifiera användning innan sync.";

const policy = envPolicy as {
  knownEmptyOk: string[];
  runtimeOnlyKeys: string[];
  extraKnownKeys: string[];
  rules: { key: string; classification: string; recommendedVercelTargets: string[] }[];
};

const ALL_VERCEL_TARGETS = ["development", "preview", "production"] as const;

const serverSchemaKeys = Object.keys(serverSchema.shape).sort();

describe("env-policy strict schema", () => {
  it("the committed config/env-policy.json is schema-valid", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(envPolicy);
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});

describe("env-policy rules integrity", () => {
  it("has no duplicate rule keys", () => {
    // Both runtime consumers collapse rules by key (new Map(...) in env-audit.ts,
    // a Python dict in manage_env.py), so a duplicate would silently let the
    // later entry override the intended classification/targets while the editor
    // still shows both rows. JSON Schema can't express field-uniqueness across
    // array items, so it is asserted here (and guarded on save in env_policy.py).
    // Trim before comparing: " X " and "X" collapse to the same key at runtime.
    const keys = policy.rules.map((r) => r.key.trim());
    const dupes = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))].sort();
    expect(dupes, `duplicate env-policy rules[].key (trimmed): ${dupes.join(", ")}`).toEqual([]);
  });

  it("no rule key has leading/trailing whitespace", () => {
    // Mirrors the schema `pattern` on key; a padded key would collapse onto the
    // trimmed key at runtime and silently override another rule.
    const padded = policy.rules.map((r) => r.key).filter((k) => k !== k.trim()).sort();
    expect(padded, `rule keys with surrounding whitespace: ${padded.join(", ")}`).toEqual([]);
  });

  it("shared_runtime rules declare the complete Vercel target set", () => {
    // shared_runtime = app needs it in every environment, so a partial/empty
    // recommendedVercelTargets would suppress legitimate MISSING/TARGET audit
    // findings for an app-critical key.
    const incomplete = policy.rules
      .filter((r) => r.classification === "shared_runtime")
      .filter((r) => !ALL_VERCEL_TARGETS.every((t) => (r.recommendedVercelTargets ?? []).includes(t)))
      .map((r) => r.key)
      .sort();
    expect(
      incomplete,
      `shared_runtime rules missing the full target set (development/preview/production): ${incomplete.join(", ")}`,
    ).toEqual([]);
  });
});

describe("env-policy ↔ serverSchema parity", () => {
  it("every env var the app reads (serverSchema) has an intentional classification", () => {
    // Codex P2: list-only membership (extraKnownKeys / runtimeOnlyKeys /
    // knownEmptyOk) is NOT governance — getEnvRule ignores those lists and would
    // fall through to the generic catch-all, so audit/reconcile would use the
    // default optional-runtime targets instead of an intentional policy. Require
    // an explicit rule OR a documented env-audit heuristic, i.e. getEnvRule must
    // not return the catch-all. A new serverSchema key with no rule and no
    // heuristic fails here, forcing a real governance decision.
    const ungoverned = serverSchemaKeys.filter(
      (key) => getEnvRule(key).notes === CATCHALL_NOTE,
    );
    expect(
      ungoverned,
      `serverSchema keys with no explicit rule and no env-audit heuristic — add a ` +
        `rule in config/env-policy.json (list membership alone is not governance):\n` +
        ungoverned.join("\n"),
    ).toEqual([]);
  });

  it("every `shared_runtime` rule names a key the app actually reads", () => {
    const serverSchemaKeySet = new Set(serverSchemaKeys);
    const orphaned = policy.rules
      .filter((r) => r.classification === "shared_runtime")
      .map((r) => r.key)
      .filter((key) => !serverSchemaKeySet.has(key))
      .sort();
    expect(
      orphaned,
      `rules marked shared_runtime but missing from serverSchema (src/lib/env.ts) — ` +
        `either add them to serverSchema or reclassify:\n` +
        orphaned.join("\n"),
    ).toEqual([]);
  });
});
