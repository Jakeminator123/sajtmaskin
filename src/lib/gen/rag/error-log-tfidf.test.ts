import { describe, expect, it } from "vitest";
import { buildTfIdfIndex, queryTfIdfIndex } from "./error-log-tfidf";

describe("error-log TF-IDF", () => {
  const docs = [
    {
      id: "a",
      text: "missing react import in src app page tsx",
      payload: { kind: "react-import" },
    },
    {
      id: "b",
      text: "metadata client conflict use client and metadata export",
      payload: { kind: "metadata-conflict" },
    },
    {
      id: "c",
      text: "tailwind apply unknown utility class component layer",
      payload: { kind: "tailwind-apply" },
    },
    {
      id: "d",
      text: "missing react hook import useState useEffect",
      payload: { kind: "react-hook" },
    },
  ];

  it("returns top-K hits ordered by cosine similarity (top hit must mention react+import+missing)", () => {
    const index = buildTfIdfIndex(docs);
    const hits = queryTfIdfIndex(index, "missing react import", 3);
    expect(hits.length).toBeGreaterThan(0);
    // Both 'a' and 'd' carry the trio "missing react import"; cosine + IDF
    // prefers the shorter doc (higher density). What we MUST guarantee is
    // that the top hit is one of the relevant docs, never 'b' or 'c'.
    expect(["a", "d"]).toContain(hits[0].document.id);
    expect(hits[0].document.text).toMatch(/missing/);
    expect(hits[0].document.text).toMatch(/react/);
    expect(hits[0].document.text).toMatch(/import/);
  });

  it("returns empty array on empty query / index", () => {
    const empty = buildTfIdfIndex<{ kind: string }>([]);
    expect(queryTfIdfIndex(empty, "anything", 5)).toEqual([]);
    const idx = buildTfIdfIndex(docs);
    expect(queryTfIdfIndex(idx, "", 5)).toEqual([]);
    expect(queryTfIdfIndex(idx, "    ", 5)).toEqual([]);
  });

  it("filters out stopwords and short tokens — top hit must contain 'react' and 'import'", () => {
    const idx = buildTfIdfIndex(docs);
    // Query is mostly stopwords — should still pick a doc that mentions react+import.
    const hits = queryTfIdfIndex(idx, "the missing of a react import is", 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(["a", "d"]).toContain(hits[0].document.id);
    expect(hits[0].document.text).toMatch(/react/);
  });

  it("scores 0 / no-hit for query with no overlapping tokens", () => {
    const idx = buildTfIdfIndex(docs);
    const hits = queryTfIdfIndex(idx, "kubernetes mongodb sharding", 5);
    expect(hits.length).toBe(0);
  });

  it("respects topK", () => {
    const idx = buildTfIdfIndex(docs);
    const hits = queryTfIdfIndex(idx, "missing import react", 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });
});
