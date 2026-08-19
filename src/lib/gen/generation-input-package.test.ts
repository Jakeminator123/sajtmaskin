import { describe, expect, it } from "vitest";

import { computeLineageHash, serializePackageForDump } from "./generation-input-package";
import type { GenerationInputPackage, GenerationSource } from "./generation-input-package";

function lineageInput(overrides: Record<string, unknown> = {}) {
  return {
    userPrompt: "Byt rubriken",
    brief: null,
    scaffoldMode: "off",
    scaffoldContext: undefined,
    routePlan: { routes: [{ path: "/" }] },
    preGenerationContracts: null,
    importedRepoMode: true,
    importedRepoBaselineHash: "a".repeat(64),
    importedRepoCurrentHash: "b".repeat(64),
    ...overrides,
  };
}

describe("computeLineageHash imported repo contract", () => {
  it("changes when the current imported-repo structure changes", () => {
    const before = computeLineageHash(lineageInput());
    const after = computeLineageHash(lineageInput({ importedRepoCurrentHash: "c".repeat(64) }));

    expect(after).not.toBe(before);
  });

  it("distinguishes scaffold-less imports from ordinary Scaffold: Av", () => {
    const imported = computeLineageHash(lineageInput());
    const scaffoldOff = computeLineageHash(
      lineageInput({
        importedRepoMode: false,
        importedRepoBaselineHash: null,
        importedRepoCurrentHash: null,
      }),
    );

    expect(imported).not.toBe(scaffoldOff);
  });
});

describe("serializePackageForDump source receipt", () => {
  it("includes sources without prompt text", () => {
    const sources: GenerationSource[] = [
      {
        kind: "media",
        id: "hero-photo",
        origin: "media-catalog",
        reason: "catalog alias",
        authority: "inspiration",
        reachedPrompt: false,
      },
    ];
    const dump = serializePackageForDump({
      lineageHash: "lh",
      userPrompt: "Bygg en hero",
      rawPrompt: "Bygg en hero",
      brief: null,
      scaffoldMode: "auto",
      resolvedScaffold: null,
      engineSystemPrompt: "SECRET_SYSTEM_PROMPT",
      dynamicContext: "SECRET_DYNAMIC",
      dynamicContextPruning: {
        budgetTokens: 10,
        usedTokens: 4,
        droppedBlockKeys: ["media_catalog"],
        keptBlockKeys: [],
      },
      dynamicContextBlocks: [],
      promptSize: {
        total: { chars: 1, estimatedTokens: 1 },
        staticCore: { chars: 1, estimatedTokens: 1 },
        dynamicContext: { chars: 1, estimatedTokens: 1 },
        blocks: { largest: [] },
      },
      variantId: null,
      variantTemplateId: null,
      variantTemplateReferenceAttachments: [],
      sources,
      importedRepoMode: false,
      importedRepoContractHashes: null,
    } as unknown as GenerationInputPackage);

    expect(dump.sources).toEqual(sources);
    expect(JSON.stringify(dump)).not.toContain("SECRET_SYSTEM_PROMPT");
    expect(JSON.stringify(dump)).not.toContain("SECRET_DYNAMIC");
  });
});
