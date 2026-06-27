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
  rules: { key: string; classification: string }[];
};

// A key is "acknowledged" by the governance layer if it is explicitly listed
// anywhere in the policy (a rule or one of the known-key lists). getEnvRule only
// reads `rules` + heuristics, so the lists are checked separately here.
const acknowledged = new Set<string>([
  ...policy.rules.map((r) => r.key),
  ...policy.extraKnownKeys,
  ...policy.runtimeOnlyKeys,
  ...policy.knownEmptyOk,
]);

const serverSchemaKeys = Object.keys(serverSchema.shape).sort();

describe("env-policy strict schema", () => {
  it("the committed config/env-policy.json is schema-valid", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(envPolicy);
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});

describe("env-policy ↔ serverSchema parity", () => {
  it("every env var the app reads (serverSchema) is intentionally governed", () => {
    // Governed = explicitly listed in the policy, OR getEnvRule gives it an
    // intentional classification (explicit rule or a documented heuristic in
    // env-audit.ts) rather than the generic catch-all. A brand-new serverSchema
    // key that is listed nowhere and matches no heuristic fails here, forcing a
    // governance decision instead of silently shipping ungoverned.
    const ungoverned = serverSchemaKeys.filter(
      (key) => !acknowledged.has(key) && getEnvRule(key).notes === CATCHALL_NOTE,
    );
    expect(
      ungoverned,
      `serverSchema keys neither listed in config/env-policy.json nor classified ` +
        `by an env-audit heuristic (add a rule or an extraKnownKeys entry):\n` +
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
