import { describe, expect, it } from "vitest";

import { computeLineageHash } from "./generation-input-package";

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
