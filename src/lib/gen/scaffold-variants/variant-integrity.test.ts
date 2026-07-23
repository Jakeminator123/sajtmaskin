/**
 * Variant-integritet (2026-07-22): blockerar halvfärdiga scaffold-variants.
 *
 * En variant är "i spel" först när den (1) har kuraterade signaturePatterns,
 * (2) finns i variant-embeddings-indexet, (3) bara pekar på riktiga v0-mallar
 * i Blob-manifestet, och (4) inte krockar med default-konventionen. Backoffice
 * (Scaffold Wizard / Lifecycle) kör samma efter-steg via knappar — det här
 * testet är den hårda grinden så inget halvfärdigt kan landa i master.
 *
 * Körs via `npm run scaffolds:validate` (och därmed devtest/CI).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const VARIANTS_ROOT = path.join(ROOT, "config", "scaffold-variants");
const EMBEDDINGS_PATH = path.join(VARIANTS_ROOT, "_index", "variant-embeddings.json");
const BLOB_MANIFEST_PATH = path.join(
  ROOT,
  "src",
  "lib",
  "templates",
  "template-blob-manifest.json",
);

type RawVariant = {
  id?: string;
  scaffoldId?: string;
  default?: boolean;
  sourceTemplateIds?: string[];
  signaturePatterns?: {
    layouts?: string[];
    motifs?: string[];
    antiPatterns?: string[];
  };
};

function loadVariantFiles(): Array<{ relPath: string; variant: RawVariant }> {
  const out: Array<{ relPath: string; variant: RawVariant }> = [];
  for (const scaffoldEntry of fs.readdirSync(VARIANTS_ROOT, { withFileTypes: true })) {
    if (!scaffoldEntry.isDirectory() || scaffoldEntry.name.startsWith("_")) continue;
    const dir = path.join(VARIANTS_ROOT, scaffoldEntry.name);
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const relPath = `${scaffoldEntry.name}/${file}`;
      const variant = JSON.parse(
        fs.readFileSync(path.join(dir, file), "utf-8"),
      ) as RawVariant;
      out.push({ relPath, variant });
    }
  }
  return out;
}

const variantFiles = loadVariantFiles();

describe("scaffold-variant integrity", () => {
  it("finds at least one variant (sanity)", () => {
    expect(variantFiles.length).toBeGreaterThan(0);
  });

  it("every sourceTemplateIds entry resolves to a real v0-mall in the Blob manifest", () => {
    const manifest = JSON.parse(fs.readFileSync(BLOB_MANIFEST_PATH, "utf-8")) as {
      templates?: Array<{ id?: string }>;
    };
    const blobIds = new Set(
      (manifest.templates ?? []).map((t) => String(t.id ?? "")).filter(Boolean),
    );
    const dead: string[] = [];
    for (const { relPath, variant } of variantFiles) {
      for (const id of variant.sourceTemplateIds ?? []) {
        if (!blobIds.has(id)) dead.push(`${relPath}: ${id}`);
      }
    }
    expect(dead, "dead sourceTemplateIds — use Blob ids from template-blob-manifest.json").toEqual(
      [],
    );
  });

  it("every variant has curated signaturePatterns (no half-finished variants)", () => {
    const missing: string[] = [];
    for (const { relPath, variant } of variantFiles) {
      const sp = variant.signaturePatterns;
      const ok =
        sp &&
        (sp.layouts?.length ?? 0) >= 3 &&
        (sp.motifs?.length ?? 0) >= 2 &&
        (sp.antiPatterns?.length ?? 0) >= 2;
      if (!ok) missing.push(relPath);
    }
    expect(
      missing,
      "variants missing signaturePatterns — run: npm run scaffolds:variant-patterns -- --only=<id>",
    ).toEqual([]);
  });

  it("variant-embeddings index matches the variant set exactly (no stale/missing entries)", () => {
    const embeddings = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, "utf-8")) as {
      embeddings?: Array<{ id?: string; scaffoldId?: string }>;
    };
    const indexed = new Set(
      (embeddings.embeddings ?? []).map((e) => `${e.scaffoldId}/${e.id}`),
    );
    const actual = new Set(
      variantFiles.map(({ variant }) => `${variant.scaffoldId}/${variant.id}`),
    );
    const missing = [...actual].filter((key) => !indexed.has(key));
    const stale = [...indexed].filter((key) => !actual.has(key));
    expect(
      missing,
      "variants missing from embeddings index — run: npm run scaffolds:variant-embeddings",
    ).toEqual([]);
    expect(
      stale,
      "stale embeddings entries for deleted variants — run: npm run scaffolds:variant-embeddings",
    ).toEqual([]);
  });

  it("each scaffold has at most one default variant", () => {
    const defaultsByScaffold = new Map<string, string[]>();
    for (const { variant } of variantFiles) {
      if (variant.default !== true) continue;
      const scaffoldId = String(variant.scaffoldId ?? "");
      const list = defaultsByScaffold.get(scaffoldId) ?? [];
      list.push(String(variant.id ?? ""));
      defaultsByScaffold.set(scaffoldId, list);
    }
    const conflicts = [...defaultsByScaffold.entries()].filter(([, ids]) => ids.length > 1);
    expect(conflicts, "convention: exactly one default per scaffold").toEqual([]);
  });
});
