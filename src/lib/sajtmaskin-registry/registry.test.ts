import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRegistryIndex,
  buildRegistryItem,
  listRegistryItemNames,
} from "./registry";

/**
 * Schema + self-containment guards for the @sajtmaskin registry (Fas 6).
 *
 * 1. Every served payload (index + items) validates against the VENDORED
 *    shadcn schemas in ./schema/ (see schema/README.md for provenance) — a
 *    payload the shadcn CLI/MCP rejects must never reach production.
 * 2. Every item is self-contained (the plan's kärnprincip): each import in
 *    an item's files is covered by `dependencies`, `registryDependencies`,
 *    or another file in the same item.
 */

const SCHEMA_DIR = join(__dirname, "schema");

const registrySchema = JSON.parse(
  readFileSync(join(SCHEMA_DIR, "registry.schema.json"), "utf-8"),
) as Record<string, unknown>;
const registryItemSchema = JSON.parse(
  readFileSync(join(SCHEMA_DIR, "registry-item.schema.json"), "utf-8"),
) as Record<string, unknown>;

const ajv = new Ajv({ allErrors: true, strict: false });
// The shadcn schemas declare draft-07 via the https URI; ajv only registers
// the meta-schema under http://, so alias it.
ajv.addMetaSchema(
  ajv.getSchema("http://json-schema.org/draft-07/schema#")!.schema as Record<string, unknown>,
  "https://json-schema.org/draft-07/schema#",
);
// The registry schema $refs the item schema by absolute URL; register the
// vendored copy under that URL so the $ref resolves offline.
ajv.addSchema(registryItemSchema, "https://ui.shadcn.com/schema/registry-item.json");
const validateRegistry = ajv.compile(registrySchema);
const validateItem = ajv.getSchema("https://ui.shadcn.com/schema/registry-item.json")!;

const itemNames = listRegistryItemNames();

describe("@sajtmaskin registry schema", () => {
  it("has at least the Fas 6 proof items", () => {
    expect(itemNames).toEqual(
      expect.arrayContaining(["saas-hero", "pricing-section", "faq-accordion"]),
    );
  });

  it("index validates against the vendored registry schema", () => {
    const index = buildRegistryIndex();
    const valid = validateRegistry(index);
    expect(validateRegistry.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
    expect(index.name).toBe("sajtmaskin");
    expect(index.homepage).toBe("https://sajtmaskin.vercel.app");
  });

  it.each(itemNames)("item %s validates against the vendored registry-item schema", (name) => {
    const item = buildRegistryItem(name);
    expect(item).not.toBeNull();
    const valid = validateItem(item);
    expect(validateItem.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it.each(itemNames)("item %s serves non-empty file content", (name) => {
    const item = buildRegistryItem(name) as {
      files: Array<{ path: string; content?: string; target?: string }>;
    };
    expect(item.files.length).toBeGreaterThan(0);
    for (const file of item.files) {
      expect(file.path.endsWith(".tsx")).toBe(true);
      expect(file.target).toBeTruthy();
      expect((file.content ?? "").length).toBeGreaterThan(100);
    }
  });

  it("returns null for unknown items", () => {
    expect(buildRegistryItem("does-not-exist")).toBeNull();
  });
});

/**
 * Self-containment (kärnprincipen): every import in every served file must be
 * covered so an inserted item compiles in a user-site context. Allowed:
 *  - framework imports (react, next/*)
 *  - npm packages listed in `dependencies`
 *  - `@/components/ui/<primitive>` where <primitive> is in `registryDependencies`
 *  - other files included in the same item (by target path)
 */
describe("@sajtmaskin registry self-containment", () => {
  const FRAMEWORK_IMPORTS = new Set(["react", "react-dom"]);

  function extractImports(content: string): string[] {
    return [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  }

  it.each(itemNames)("item %s covers every import", (name) => {
    const item = buildRegistryItem(name) as {
      dependencies?: string[];
      registryDependencies?: string[];
      files: Array<{ path: string; content?: string; target?: string }>;
    };
    const dependencies = item.dependencies ?? [];
    const registryDependencies = new Set(item.registryDependencies ?? []);
    const ownTargets = new Set(
      item.files.map((file) => (file.target ?? "").replace(/\.tsx?$/, "")),
    );

    for (const file of item.files) {
      for (const specifier of extractImports(file.content ?? "")) {
        const uiMatch = specifier.match(/^@\/components\/ui\/([\w-]+)$/);
        const covered =
          FRAMEWORK_IMPORTS.has(specifier) ||
          specifier.startsWith("next/") ||
          dependencies.some(
            (dep) => specifier === dep || specifier.startsWith(`${dep}/`),
          ) ||
          (uiMatch !== null && registryDependencies.has(uiMatch[1])) ||
          ownTargets.has(specifier.replace(/^@\//, ""));
        expect(
          covered,
          `${name}/${file.path}: import "${specifier}" is not covered by dependencies/registryDependencies/own files`,
        ).toBe(true);
      }
    }
  });
});
