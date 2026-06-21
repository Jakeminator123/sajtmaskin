import { describe, expect, it } from "vitest";
import { resolveGenerationMode } from "./orchestrate";

describe("resolveGenerationMode (B15 — finalize/base mode consistency)", () => {
  it("respects an explicit generationMode regardless of other signals", () => {
    expect(
      resolveGenerationMode({ generationMode: "init", persistedScaffoldId: "s", previousFilesCount: 9 }),
    ).toBe("init");
    expect(resolveGenerationMode({ generationMode: "followUp", previousFilesCount: 0 })).toBe(
      "followUp",
    );
  });

  it("init when there are no previous files and no scaffold", () => {
    expect(resolveGenerationMode({})).toBe("init");
    expect(resolveGenerationMode({ persistedScaffoldId: null, previousFilesCount: 0 })).toBe("init");
  });

  it("follow-up once previous files exist", () => {
    expect(resolveGenerationMode({ previousFilesCount: 1 })).toBe("followUp");
    expect(resolveGenerationMode({ persistedScaffoldId: "s", previousFilesCount: 4 })).toBe(
      "followUp",
    );
  });

  it("P26 edge: scaffold pinned but previousFilesCount === 0 resolves to init (matches resolveOrchestrationBase, not the stale scaffold-only check)", () => {
    expect(resolveGenerationMode({ persistedScaffoldId: "scaffold_x", previousFilesCount: 0 })).toBe(
      "init",
    );
  });
});
