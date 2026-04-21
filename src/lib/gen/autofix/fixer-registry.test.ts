import { describe, expect, it } from "vitest";
import {
  FIXER_REGISTRY,
  FIXER_REGISTRY_SIZE,
  getFixerById,
  getMechanicalFixerIds,
  listFixersByCategory,
  listFixersByPhase,
} from "./fixer-registry";

describe("fixer-registry", () => {
  it("has at least 30 entries (covers all known fixers + LLM phases + verifier)", () => {
    expect(FIXER_REGISTRY_SIZE).toBeGreaterThanOrEqual(30);
  });

  it("has unique fixer IDs", () => {
    const ids = FIXER_REGISTRY.map((entry) => entry.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("getFixerById returns matching entry", () => {
    const reactImport = getFixerById("react-import-fixer");
    expect(reactImport).toBeDefined();
    expect(reactImport?.category).toBe("mechanical-import");
  });

  it("getFixerById returns undefined for unknown id", () => {
    expect(getFixerById("not-a-real-fixer")).toBeUndefined();
  });

  it("listFixersByCategory groups all entries", () => {
    const grouped = listFixersByCategory();
    const total = Object.values(grouped).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(FIXER_REGISTRY_SIZE);
  });

  it("listFixersByPhase groups all entries", () => {
    const grouped = listFixersByPhase();
    const total = Object.values(grouped).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(FIXER_REGISTRY_SIZE);
  });

  it("getMechanicalFixerIds includes well-known mechanical fixers", () => {
    const ids = new Set(getMechanicalFixerIds());
    for (const expected of [
      "use-client-fixer",
      "react-import-fixer",
      "react-hook-import-fixer",
      "lucide-image-fixer",
      "duplicate-import-binding-fixer",
      "tailwind-apply-component-fixer",
      "r3f-vector-tuple-fixer",
    ]) {
      expect(ids.has(expected)).toBe(true);
    }
  });

  it("every entry has a non-empty sourcePath and targetFailureMode", () => {
    for (const entry of FIXER_REGISTRY) {
      expect(entry.sourcePath.length).toBeGreaterThan(5);
      expect(entry.targetFailureMode.length).toBeGreaterThan(3);
      expect(entry.triggers.length).toBeGreaterThan(0);
    }
  });

  it("sourcePath always points to a path under src/lib/gen/autofix or finalize-version.ts/repair-loop.ts", () => {
    const allowedRoots = [
      "src/lib/gen/autofix/",
      "src/lib/gen/stream/finalize-version.ts",
      "src/lib/gen/verify/",
    ];
    for (const entry of FIXER_REGISTRY) {
      const ok = allowedRoots.some((root) => entry.sourcePath.startsWith(root));
      expect(
        ok,
        `${entry.id} has sourcePath ${entry.sourcePath} outside allowed roots`,
      ).toBe(true);
    }
  });

  it("includes all four LLM repair phases", () => {
    const llmIds = new Set(
      FIXER_REGISTRY.filter((e) => e.category.startsWith("llm-")).map((e) => e.id),
    );
    expect(llmIds.has("llm-syntax-fixer")).toBe(true);
    expect(llmIds.has("llm-verifier-fixer")).toBe(true);
    expect(llmIds.has("llm-partial-file-repair")).toBe(true);
    expect(llmIds.has("llm-server-repair")).toBe(true);
  });
});
