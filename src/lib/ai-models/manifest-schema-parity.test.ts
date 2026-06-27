/**
 * Parity guard: the backoffice JSON Schema (`config/ai_models/manifest.schema.json`)
 * must not drift from the runtime Zod authority (`aiModelsManifestSchema` in
 * load-manifest.ts). Plan B #6.
 *
 * Why: the JSON Schema is what the backoffice manifest editor validates against
 * on save; the Zod schema is what runtime actually parses. If they drift, the
 * editor can bless a manifest runtime rejects (or vice versa). Historically the
 * JSON Schema was looser (`additionalProperties: true` top-level, and it was
 * missing `matching` + `phaseRouting.thinkingByTier` that Zod has).
 *
 * The test asserts:
 *   1. top-level property keys match exactly (set equality),
 *   2. top-level `required` matches Zod's non-optional keys exactly,
 *   3. the JSON Schema describes phaseRouting.thinkingByTier (the specific
 *      historical drift), and is closed at the top level
 *      (`additionalProperties: false`),
 *   4. the committed manifest validates against BOTH schemas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { aiModelsManifestSchema, getAiModelsManifest } from "./load-manifest";

const REPO_ROOT = join(__dirname, "..", "..", "..");

const jsonSchema = JSON.parse(
  readFileSync(join(REPO_ROOT, "config/ai_models/manifest.schema.json"), "utf8"),
) as {
  additionalProperties?: boolean;
  required?: string[];
  properties: Record<string, unknown>;
  $defs?: Record<string, unknown>;
};

const rawManifest = JSON.parse(
  readFileSync(join(REPO_ROOT, "config/ai_models/manifest.json"), "utf8"),
) as unknown;

const zodShape = aiModelsManifestSchema.shape;
const zodKeys = Object.keys(zodShape).sort();

/** A Zod field is "required" iff it rejects `undefined`. */
function zodRequiredKeys(): string[] {
  return Object.entries(zodShape)
    .filter(([, field]) => !(field as { safeParse: (v: unknown) => { success: boolean } }).safeParse(undefined).success)
    .map(([key]) => key)
    .sort();
}

describe("manifest JSON Schema ↔ Zod parity", () => {
  it("top-level property keys match exactly", () => {
    const jsonKeys = Object.keys(jsonSchema.properties).sort();
    expect(jsonKeys).toEqual(zodKeys);
  });

  it("top-level required set matches Zod's non-optional keys", () => {
    const jsonRequired = [...(jsonSchema.required ?? [])].sort();
    expect(jsonRequired).toEqual(zodRequiredKeys());
  });

  it("is closed at the top level (additionalProperties: false)", () => {
    expect(jsonSchema.additionalProperties).toBe(false);
  });

  it("describes phaseRouting.thinkingByTier (the historical drift)", () => {
    const phaseRouting = jsonSchema.properties.phaseRouting as {
      properties?: Record<string, unknown>;
    };
    expect(phaseRouting.properties).toHaveProperty("thinkingByTier");
    expect(jsonSchema.$defs).toHaveProperty("phaseThinkingTier");
  });

  it("the committed manifest validates against the JSON Schema", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(jsonSchema);
    const ok = validate(rawManifest);
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("the committed manifest validates against the runtime Zod schema", () => {
    // Throws if invalid — the runtime authority.
    expect(() => getAiModelsManifest()).not.toThrow();
  });
});
