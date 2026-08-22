import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const STRICT_SCHEMA_PATH = join(
  REPO_ROOT,
  "docs",
  "schemas",
  "strict",
  "dossier.schema.json",
);
const MANIFEST_SCHEMA_REF = "../../../../docs/schemas/strict/dossier.schema.json";

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function liveManifestPaths(): string[] {
  const paths: string[] = [];
  for (const dossierClass of ["hard", "soft"] as const) {
    const root = join(REPO_ROOT, "data", "dossiers", dossierClass);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      paths.push(join(root, entry.name, "manifest.json"));
    }
  }
  return paths.sort();
}

describe("dossier strict-schema ownership", () => {
  it("uses the canonical strict schema in the runtime validator", () => {
    const validator = readRepoFile("src/lib/gen/dossiers/validate-manifest.ts");

    expect(validator).toContain(
      'import dossierSchema from "../../../../docs/schemas/strict/dossier.schema.json";',
    );
    expect(validator).toContain("ajv.compile(dossierSchema)");

    const schema = JSON.parse(readFileSync(STRICT_SCHEMA_PATH, "utf8")) as {
      additionalProperties?: unknown;
      properties?: Record<string, unknown>;
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toHaveProperty("capability");
    expect(schema.properties).toHaveProperty("promptInstructionMode");
  });

  it("points Backoffice at the same canonical schema", () => {
    const constants = readRepoFile("backoffice/pages/dossiers_lib/constants.py").replace(
      /\s+/g,
      " ",
    );

    expect(constants).toContain(
      'STRICT_SCHEMA_PATH = REPO_ROOT / "docs" / "schemas" / "strict" / "dossier.schema.json"',
    );
  });

  it("requires the canonical $schema pointer on every live manifest", () => {
    const manifests = liveManifestPaths();
    const pointers = manifests.map((path) => {
      const manifest = JSON.parse(readFileSync(path, "utf8")) as { $schema?: unknown };
      return {
        path: relative(REPO_ROOT, path).replaceAll("\\", "/"),
        ref: typeof manifest.$schema === "string" ? manifest.$schema : null,
      };
    });

    expect(manifests.length).toBeGreaterThan(0);
    expect(pointers.filter(({ ref }) => ref !== MANIFEST_SCHEMA_REF)).toEqual([]);
  });
});
