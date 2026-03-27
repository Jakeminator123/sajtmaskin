/**
 * Integration checks for curated external templates (Vercel scrape → template-library).
 * Committed artifacts: template-library.generated.json + template-library-embeddings.json.
 *
 * If entries.length === 0, run hydrate + build + embeddings (see research/external-templates/README.md and scripts/README.md).
 */
import { describe, expect, it } from "vitest";
import catalogJson from "./template-library.generated.json";
import embeddingsJson from "./template-library-embeddings.json";
import { getTemplateLibraryEntries, getTemplateLibraryEntryById } from "./catalog";
import {
  searchTemplateLibrary,
  searchTemplateLibraryKeywordsOnly,
  selectTemplateReferenceFiles,
} from "./search";

const entries = getTemplateLibraryEntries();
const catalogIds = new Set(entries.map((e) => e.id));
const embeddingIds = new Set(embeddingsJson.embeddings.map((e) => e.id));

describe("template-library external templates (committed catalog)", () => {
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
      expect(e.recommendedScaffoldFamilies?.length).toBeGreaterThan(0);
      expect(e.qualityScore).toBeGreaterThanOrEqual(45);
      expect(Array.isArray(e.selectedFiles)).toBe(true);
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
});
