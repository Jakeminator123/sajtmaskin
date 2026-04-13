/**
 * Integration checks for curated external templates (Vercel scrape → template-library).
 * Local generated artifacts: template-library.generated.json + template-library-embeddings.json.
 *
 * If entries.length === 0, run hydrate + build + embeddings (see scripts/README.md).
 */
import { describe, expect, it } from "vitest";
import { getAllScaffolds, getScaffoldIds } from "@/lib/gen/scaffolds";
import {
  getTemplateLibraryCatalog,
  getTemplateLibraryEntries,
  getTemplateLibraryEntryById,
} from "./catalog";
import { deriveTemplateRuntimeGuidance } from "./runtime-guidance";
import {
  searchTemplateLibrary,
  searchTemplateLibraryKeywordsOnly,
  selectTemplateReferenceFiles,
} from "./search";

let catalogJson: { entries?: { id: string }[]; curatedTemplates?: number } = { entries: [], curatedTemplates: 0 };
let embeddingsJson: { embeddings: { id: string }[] } = { embeddings: [] };
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  catalogJson = require("./template-library.generated.json");
} catch { /* generated file may be absent after cleanup */ }
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  embeddingsJson = require("./template-library-embeddings.json");
} catch { /* generated file may be absent after cleanup */ }

const entries = getTemplateLibraryEntries();
const catalogIds = new Set(entries.map((e) => e.id));
const embeddingIds = new Set((embeddingsJson.embeddings ?? []).map((e) => e.id));
const knownScaffoldFamilies = new Set(getScaffoldIds());

describe("template-library external templates (local generated catalog)", () => {
  it("has at least one curated entry (rebuild pipeline if zero)", () => {
    expect(entries.length, "Run hydrate + build-template-library + template-library:embeddings").toBeGreaterThan(
      0,
    );
  });

  it("embeddings cover exactly the same ids as the catalog", () => {
    if (entries.length === 0) return;
    expect(embeddingsJson.embeddings.length).toBe(entries.length);
    for (const id of catalogIds) {
      expect(embeddingIds.has(id), `embedding missing for ${id}`).toBe(true);
    }
    for (const id of embeddingIds) {
      expect(catalogIds.has(id), `orphan embedding id ${id}`).toBe(true);
    }
  });

  it("each entry has fields needed for prompt enrichment", () => {
    for (const e of entries) {
      expect(e.title?.trim().length).toBeGreaterThan(0);
      expect(e.categoryName?.trim().length).toBeGreaterThan(0);
      expect(e.summary?.trim().length).toBeGreaterThan(0);
      expect(e.recommendedScaffoldIds?.length).toBeGreaterThan(0);
      expect(e.classification?.useCaseTags?.length ?? 0).toBeGreaterThan(0);
      expect(e.classification?.siteFormTags?.length ?? 0).toBeGreaterThan(0);
      expect(Array.isArray(e.classification?.technicalPatternTags)).toBe(true);
      expect(e.qualityScore).toBeGreaterThanOrEqual(45);
      expect(e.runtimeGuidance?.styleRules?.length ?? 0).toBeGreaterThan(0);
      expect(e.runtimeGuidance?.sectionInventory?.length ?? 0).toBeGreaterThan(0);
      expect(e.runtimeGuidance?.avoidPatterns?.length ?? 0).toBeGreaterThan(0);
      expect(e.runtimeGuidance?.worldClassRubric?.length ?? 0).toBeGreaterThan(0);
      expect(Array.isArray(e.selectedFiles)).toBe(true);
    }
  });

  it("only references known runtime scaffold families", () => {
    for (const entry of entries) {
      for (const family of entry.recommendedScaffoldIds) {
        expect(knownScaffoldFamilies.has(family), `unknown scaffold family ${family} on ${entry.id}`).toBe(true);
      }
    }
  });

  it("keyword search surfaces relevant templates for English queries", () => {
    if (entries.length === 0) return;
    const dash = searchTemplateLibraryKeywordsOnly("Next.js admin dashboard template", 5);
    expect(dash.length).toBeGreaterThan(0);
    expect(dash[0]?.entry.id).toBeTruthy();

    const marketing = searchTemplateLibraryKeywordsOnly("marketing website landing", 5);
    expect(marketing.length).toBeGreaterThan(0);
  });

  it("getTemplateLibraryEntryById resolves committed ids", () => {
    if (entries.length === 0) return;
    const first = entries[0]!;
    expect(getTemplateLibraryEntryById(first.id)?.title).toBe(first.title);
    expect(getTemplateLibraryEntryById("nonexistent-id-xyz")).toBeNull();
  });

  it("selectTemplateReferenceFiles returns excerpts when selectedFiles exist", () => {
    if (entries.length === 0) return;
    const withFiles = entries.find((e) => e.selectedFiles.length > 0);
    if (!withFiles) {
      expect.fail("expected at least one entry with selectedFiles");
    }
    const picked = selectTemplateReferenceFiles(withFiles, { maxFiles: 2, maxExcerptChars: 500 });
    expect(picked.length).toBeGreaterThan(0);
    expect(picked[0]!.excerpt.length).toBeGreaterThan(0);
    expect(picked[0]!.path).toBeTruthy();
  });

  it("semantic search returns ranked results when OpenAI key is set", async () => {
    if (entries.length === 0) return;
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return;
    }
    const results = await searchTemplateLibrary("SaaS dashboard with analytics panels", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.score).toBeGreaterThan(0);
    expect(catalogIds.has(results[0]!.entry.id)).toBe(true);
  });
});

describe("template-library.generated.json snapshot contract", () => {
  it("matches runtime catalog length", () => {
    const fromFile = Array.isArray(catalogJson.entries) ? catalogJson.entries.length : 0;
    expect(fromFile).toBe(entries.length);
  });

  it("declares curatedTemplates consistent with entries", () => {
    expect(catalogJson.curatedTemplates).toBe(catalogJson.entries?.length ?? 0);
  });

  it("runtime catalog strips machine-absolute paths", () => {
    const runtimeCatalog = getTemplateLibraryCatalog();
    const absolutePathRe = /^(?:[a-z]:[\\/]|\/)/i;

    expect(absolutePathRe.test(runtimeCatalog.sourceRoot)).toBe(false);
    for (const entry of runtimeCatalog.entries) {
      if (!entry.repo.clonePath) continue;
      expect(absolutePathRe.test(entry.repo.clonePath)).toBe(false);
    }
  });
});

describe("scaffold-anchored template guidance (end-to-end proof)", () => {
  it("every scaffold with referenceTemplates resolves at least one catalog entry with runtimeGuidance", () => {
    if (entries.length === 0) return;

    const scaffolds = getAllScaffolds();
    const results: Array<{ scaffoldId: string; hits: number; misses: number; sampleTitle?: string; sampleStyleRules?: number }> = [];

    for (const s of scaffolds) {
      const refs = s.research?.referenceTemplates ?? [];
      if (refs.length === 0) continue;
      let hits = 0;
      let misses = 0;
      let sampleTitle: string | undefined;
      let sampleStyleRules: number | undefined;
      for (const ref of refs.slice(0, 2)) {
        const entry = getTemplateLibraryEntryById(ref.id);
        if (entry) {
          hits++;
          if (!sampleTitle) {
            sampleTitle = entry.title;
            const g = deriveTemplateRuntimeGuidance(entry);
            sampleStyleRules = g.styleRules.length;
          }
        } else {
          misses++;
        }
      }
      results.push({ scaffoldId: s.id, hits, misses, sampleTitle, sampleStyleRules });
    }

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.hits, `${r.scaffoldId}: expected at least 1 catalog hit but got 0`).toBeGreaterThan(0);
      expect(r.sampleStyleRules, `${r.scaffoldId} -> ${r.sampleTitle}: no styleRules`).toBeGreaterThan(0);
    }
  });

  it("formatted guidance text contains expected structure markers", () => {
    if (entries.length === 0) return;

    const ecommerce = getAllScaffolds().find((s) => s.id === "ecommerce");
    if (!ecommerce?.research?.referenceTemplates?.length) return;
    const ref = ecommerce.research.referenceTemplates[0]!;
    const entry = getTemplateLibraryEntryById(ref.id);
    if (!entry) return;
    const g = deriveTemplateRuntimeGuidance(entry);

    const lines: string[] = [
      "- External template guidance (adapt to the scaffold and user request, do not copy verbatim):",
    ];
    if (g.styleRules.length > 0) {
      lines.push(`  - **${entry.title}** style: ${g.styleRules.slice(0, 2).join("; ")}`);
    }
    if (g.sectionInventory.length > 0) {
      lines.push(`  - Sections: ${g.sectionInventory.slice(0, 3).join(", ")}`);
    }
    const formatted = lines.join("\n");
    expect(formatted).toContain("External template guidance");
    expect(formatted).toContain(entry.title);
    expect(formatted).toContain("Sections:");
    expect(formatted).not.toContain("selectedFiles");
    expect(formatted).not.toContain("excerpt");
  });
});
