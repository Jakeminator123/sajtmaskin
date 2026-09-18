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

import { getScaffoldIds } from "@/lib/gen/scaffolds/registry";
import { SCAFFOLD_OFF_BASELINE_ID } from "@/lib/gen/scaffolds/types";
import { computeExtractorSha256 } from "./extractor-fingerprint";
import { parseVariantTemplateAddendaRegistry } from "./variant-template-addendum";
import { validateVariantTemplateReferences } from "./variant-template-reference-integrity";

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
const TEMPLATE_ADDENDA_PATH = path.join(ROOT, "config", "variant-template-addenda.json");

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

/**
 * Scaffold: Av never resolves template inspiration
 * (`shouldResolveVariantTemplateInspiration`), so provenance on its variants
 * is dead config. Every other variant must cite selectable templates.
 */
const inspirationVariantFiles = variantFiles.filter(
  ({ variant }) => variant.scaffoldId !== SCAFFOLD_OFF_BASELINE_ID,
);

function collectDefaultVariantIds(
  scaffoldIds: readonly string[],
  files: Array<{ variant: RawVariant }>,
): Map<string, string[]> {
  const defaultsByScaffold = new Map(
    scaffoldIds.map((scaffoldId) => [scaffoldId, [] as string[]]),
  );
  for (const { variant } of files) {
    const scaffoldId = String(variant.scaffoldId ?? "");
    const list = defaultsByScaffold.get(scaffoldId) ?? [];
    if (variant.default === true) list.push(String(variant.id ?? ""));
    defaultsByScaffold.set(scaffoldId, list);
  }
  return defaultsByScaffold;
}

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

  /**
   * A category the runtime can never select (`components`, `design-systems`,
   * plain `ai`, …) is dead config: it costs an addendum entry and reads like a
   * curated candidate while contributing nothing. The 2026-07-22 one-shot
   * remap left four such ids behind; this guard stops any writer — Backoffice,
   * a script or a hand edit — from reintroducing them.
   */
  it("no sourceTemplateIds entry points to a category the runtime can never select", () => {
    const dead = variantFiles.flatMap(({ relPath, variant }) =>
      validateVariantTemplateReferences(variant.sourceTemplateIds ?? []).issues
        .filter((issue) => issue.code === "never-selectable-template")
        .map((issue) => `${relPath}: ${issue.templateId}`),
    );
    expect(dead, "never-selectable sourceTemplateIds — remove them, they are dead config").toEqual(
      [],
    );
  });

  it("every inspiration variant resolves a selectable template or is deliberately curated off", () => {
    const unresolved: string[] = [];
    const curatedOff: string[] = [];
    for (const { relPath, variant } of inspirationVariantFiles) {
      const result = validateVariantTemplateReferences(variant.sourceTemplateIds ?? []);
      if (result.issues.some((issue) => issue.code === "no-runtime-selectable-template")) {
        unresolved.push(relPath);
      } else if (result.selectedTemplateId === null) {
        curatedOff.push(relPath);
      }
    }

    expect(unresolved, "variants without runtime-selectable template inspiration").toEqual([]);
    // Every eligible candidate disabled ⇒ runtime sends no template
    // inspiration. That is a curator decision (K1), so it is listed explicitly:
    // adding a variant here must be a conscious choice, not an accident.
    expect(curatedOff.sort(), "variants whose inspiration is curated off").toEqual([
      "base-nextjs/starter-neutral.json",
    ]);
  });

  it("uses the same runtime-selectability and addendum decision for save-time checks", () => {
    // Curator-disabled candidates are not selectable, but a variant that cites
    // only disabled templates is curated off — not broken.
    expect(validateVariantTemplateReferences(["8Y9E0cStKrW"])).toEqual({
      selectedTemplateId: null,
      disabledCandidateIds: ["8Y9E0cStKrW"],
      issues: [],
    });

    // A usable candidate always wins over a disabled one, in any order.
    expect(validateVariantTemplateReferences(["8Y9E0cStKrW", "zoQPxUaTqvE"])).toMatchObject({
      selectedTemplateId: "zoQPxUaTqvE",
      disabledCandidateIds: ["8Y9E0cStKrW"],
      issues: [],
    });

    const neverSelectable = validateVariantTemplateReferences(["0NFF1rjZrz5"]);
    expect(neverSelectable.selectedTemplateId).toBeNull();
    expect(neverSelectable.issues).toEqual([
      expect.objectContaining({ code: "never-selectable-template", templateId: "0NFF1rjZrz5" }),
      expect.objectContaining({ code: "no-runtime-selectable-template" }),
    ]);

    expect(validateVariantTemplateReferences(["not-a-blob-id"]).issues).toEqual([
      expect.objectContaining({ code: "unknown-template", templateId: "not-a-blob-id" }),
      expect.objectContaining({ code: "no-runtime-selectable-template" }),
    ]);
  });

  it("every referenced template has a current or explicitly disabled addendum", () => {
    const missingOrStale = variantFiles.flatMap(({ relPath, variant }) =>
      validateVariantTemplateReferences(variant.sourceTemplateIds ?? []).issues
        .filter((issue) => issue.code.endsWith("addendum"))
        .map((issue) => `${relPath}: ${issue.detail}`),
    );

    expect(
      missingOrStale.sort(),
      "variant template addenda must cover every cited Blob id; run npm run templates:addenda -- --write",
    ).toEqual([]);
  });

  it("carries no addendum entry that no variant cites", () => {
    // `templates:addenda --write` preserves existing entries, so a removed
    // sourceTemplateId leaves its excerpts behind unless pruned by hand.
    const addenda = parseVariantTemplateAddendaRegistry(
      JSON.parse(fs.readFileSync(TEMPLATE_ADDENDA_PATH, "utf-8")) as unknown,
    );
    const cited = new Set(variantFiles.flatMap(({ variant }) => variant.sourceTemplateIds ?? []));
    const orphaned = addenda.templates
      .map((entry) => entry.templateId)
      .filter((templateId) => !cited.has(templateId));
    expect(orphaned, "addenda entries without any citing variant").toEqual([]);
  });

  /**
   * The registry was bound only to the archive SHA, so it could not tell that
   * the *extractor* had changed. `npm run templates:addenda -- --check` is not
   * wired into CI, which made the test suite the only place this can be caught:
   * without this assertion, tightening an extraction rule left the old excerpts
   * shipping to the LLM with every check green.
   */
  it("every generated addendum was produced by the current extractor", () => {
    const addenda = parseVariantTemplateAddendaRegistry(
      JSON.parse(fs.readFileSync(TEMPLATE_ADDENDA_PATH, "utf-8")) as unknown,
    );
    const expected = computeExtractorSha256(ROOT);
    const outdated = addenda.templates
      .filter(
        (entry) => entry.reviewStatus === "generated" && entry.extractorSha256 !== expected,
      )
      .map((entry) => entry.templateId);

    expect(
      outdated,
      "the extractor changed since these excerpts were extracted; run npm run templates:addenda -- --write",
    ).toEqual([]);
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
    if (!fs.existsSync(EMBEDDINGS_PATH)) {
      console.warn(
        `[skip] ${EMBEDDINGS_PATH} missing — run: npm run embeddings:sync (or scaffolds:variant-embeddings)`,
      );
      return;
    }
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

  it("each scaffold has exactly one default variant", () => {
    const defaultsByScaffold = collectDefaultVariantIds(getScaffoldIds(), variantFiles);
    // "At most one" left the zero-default case green, and a scaffold with no
    // default silently falls back to the first alphabetically sorted variant in
    // `getDefaultVariantForScaffold` — a design direction chosen by filename.
    const wrong = [...defaultsByScaffold.entries()].filter(([, ids]) => ids.length !== 1);
    expect(wrong, "convention: exactly one default variant per scaffold").toEqual([]);
  });

  it("seeds canonical scaffolds so a zero-variant family fails exact-one-default", () => {
    const defaultsByScaffold = collectDefaultVariantIds(["empty-scaffold"], []);
    const wrong = [...defaultsByScaffold.entries()].filter(([, ids]) => ids.length !== 1);

    expect(wrong).toEqual([["empty-scaffold", []]]);
  });

  it("every inspiration variant declares at least one sourceTemplateId", () => {
    // The dead-id check above iterates the array, so an EMPTY array passed
    // silently — a variant with no provenance at all was never flagged.
    const withoutSource = inspirationVariantFiles
      .filter(({ variant }) => (variant.sourceTemplateIds ?? []).length === 0)
      .map(({ relPath }) => relPath);
    expect(
      withoutSource,
      "variants must cite the v0-mall(ar) they were derived from",
    ).toEqual([]);
  });

  it("Scaffold: Av variants carry no template provenance", () => {
    // `finalize-prompts.ts` never resolves inspiration for the off-baseline
    // scaffold, so any id here is dead config that only looks curated.
    const withSource = variantFiles
      .filter(
        ({ variant }) =>
          variant.scaffoldId === SCAFFOLD_OFF_BASELINE_ID &&
          (variant.sourceTemplateIds ?? []).length > 0,
      )
      .map(({ relPath }) => relPath);
    expect(withSource, "Scaffold: Av never resolves template inspiration").toEqual([]);
  });
});
