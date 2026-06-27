/**
 * Strict-schema validator for `config/integrations/tier3-sdk-deny.json`.
 *
 * Closes the control-plane gap where this runtime-wired, backoffice-editable
 * policy had `validator: null` (Plan B #7). The committed deny-list must stay
 * structurally valid so the runtime loader (`src/lib/integrations/tier3-sdk-deny.ts`)
 * and the F2 design-stage prompt block never break, and an obviously-broken
 * edit (empty category, non-string module, duplicate module) is caught here in
 * `test:ci` instead of at generation time.
 *
 * The schema mirrors the runtime parser's structural contract; the
 * cross-category module-uniqueness invariant (which JSON Schema cannot express)
 * is asserted separately below to match `parseDenyJson`'s duplicate guard.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..");

function loadJson(relPath: string): unknown {
  return JSON.parse(readFileSync(join(REPO_ROOT, relPath), "utf8"));
}

const schema = loadJson("docs/schemas/strict/tier3-sdk-deny.schema.json") as object;
const denyList = loadJson("config/integrations/tier3-sdk-deny.json") as {
  categories: { label: string; modules: string[] }[];
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

function fmt(errors: unknown): string {
  return JSON.stringify(errors, null, 2);
}

describe("tier3-sdk-deny.schema.json", () => {
  it("the committed deny-list is schema-valid", () => {
    const ok = validate(denyList);
    expect(ok, fmt(validate.errors)).toBe(true);
  });

  it("every module specifier is unique across all categories", () => {
    // Mirrors parseDenyJson()'s duplicate guard in tier3-sdk-deny.ts, which
    // JSON Schema cannot express across array items.
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const category of denyList.categories) {
      for (const mod of category.modules) {
        if (seen.has(mod)) {
          dupes.push(`${mod} (in "${seen.get(mod)}" and "${category.label}")`);
        } else {
          seen.set(mod, category.label);
        }
      }
    }
    expect(dupes, `duplicate modules across categories:\n${dupes.join("\n")}`).toEqual([]);
  });

  it("rejects an empty categories array", () => {
    expect(validate({ categories: [] })).toBe(false);
  });

  it("rejects a category with no modules", () => {
    expect(validate({ categories: [{ label: "Payments", modules: [] }] })).toBe(false);
  });

  it("rejects a category missing its label", () => {
    expect(validate({ categories: [{ modules: ["stripe"] }] })).toBe(false);
  });

  it("rejects a non-string module specifier", () => {
    expect(validate({ categories: [{ label: "Payments", modules: [123] }] })).toBe(false);
  });

  it("rejects an unknown top-level field", () => {
    expect(
      validate({ categories: [{ label: "Payments", modules: ["stripe"] }], extra: true }),
    ).toBe(false);
  });
});
