import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationInputPackage } from "@/lib/gen/generation-input-package";

const canonicalInputs = vi.hoisted(() => [] as unknown[]);

vi.mock("./canonical-json", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./canonical-json")>();
  return {
    ...actual,
    hashCanonicalJson(value: unknown): string {
      canonicalInputs.push(value);
      return actual.hashCanonicalJson(value);
    },
  };
});

const { createGenerationInputPackageReceipt } = await import("./package-receipt");

function largePackage(): GenerationInputPackage {
  const largePrompt = `PROMPT_FULLTEXT_SENTINEL_${"p".repeat(250_000)}`;
  const largeScaffoldFile = `SCAFFOLD_FULLTEXT_SENTINEL_${"s".repeat(500_000)}`;
  return {
    userPrompt: largePrompt,
    rawPrompt: largePrompt,
    engineSystemPrompt: `SYSTEM_FULLTEXT_SENTINEL_${"y".repeat(250_000)}`,
    dynamicContext: `DYNAMIC_FULLTEXT_SENTINEL_${"d".repeat(250_000)}`,
    buildSpec: { buildIntent: "website", previewPolicy: "fidelity2" },
    resolvedScaffold: {
      id: "landing-page",
      files: [{ path: "app/page.tsx", content: largeScaffoldFile }],
    },
    variantId: "editorial",
    variantTemplateId: null,
    variantTemplateReferenceAttachments: [],
    sources: [
      {
        kind: "ui-recipe",
        id: "hero",
        origin: "registry",
        reason: "selected",
        authority: "mönster",
        reachedPrompt: true,
      },
    ],
    importedRepoMode: false,
    importedRepoContractHashes: null,
    lineageHash: "f".repeat(64),
  } as unknown as GenerationInputPackage;
}

describe("GenerationInputPackage receipt allocation boundary", () => {
  beforeEach(() => {
    canonicalInputs.length = 0;
  });

  it("never sends prompt or scaffold fulltext to canonical JSON hashing", () => {
    const receipt = createGenerationInputPackageReceipt(largePackage());

    expect(receipt.generationInputPackageHash).toMatch(/^[a-f0-9]{64}$/);
    expect(canonicalInputs).toHaveLength(2);
    const canonicalPayloads = JSON.stringify(canonicalInputs);
    expect(canonicalPayloads).not.toContain("PROMPT_FULLTEXT_SENTINEL");
    expect(canonicalPayloads).not.toContain("SYSTEM_FULLTEXT_SENTINEL");
    expect(canonicalPayloads).not.toContain("DYNAMIC_FULLTEXT_SENTINEL");
    expect(canonicalPayloads).not.toContain("SCAFFOLD_FULLTEXT_SENTINEL");
    expect(canonicalPayloads.length).toBeLessThan(10_000);
  });
});
