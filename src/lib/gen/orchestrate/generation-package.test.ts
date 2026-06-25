import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationInputPackage } from "../generation-input-package";

// Hoisted so the mock factories below can reference them directly.
const { writeLatestPromptDumpMock, isPromptDumpEnabledMock, serializePackageForDumpMock } =
  vi.hoisted(() => ({
    writeLatestPromptDumpMock: vi.fn(),
    isPromptDumpEnabledMock: vi.fn(),
    serializePackageForDumpMock: vi.fn(() => ({ serialized: true })),
  }));

vi.mock("../prompt-dump", () => ({
  PROMPT_DUMP_CATEGORY: {
    orchestrationDynamic: "orchestration-dynamic",
    ownEngineCodegen: "own-engine-codegen",
    planModePlanner: "plan-mode-planner",
  },
  writeLatestPromptDump: writeLatestPromptDumpMock,
  isPromptDumpEnabled: isPromptDumpEnabledMock,
}));

vi.mock("../generation-input-package", () => ({
  serializePackageForDump: serializePackageForDumpMock,
  buildGenerationPromptSize: vi.fn(),
  computeLineageHash: vi.fn(),
}));

// Imported after the mocks so the module under test picks up the mocked deps.
import { writeOrchestrationDynamicDump } from "./generation-package";

function makePkg(): GenerationInputPackage {
  return {
    dynamicContext: "DYNAMIC_CONTEXT_MARKER",
    lineageHash: "lh",
    userPrompt: "prompt",
    variantId: null,
    buildSpec: {
      buildIntent: "website",
      changeScope: "full",
      contextPolicy: "standard",
      previewPolicy: "fidelity2",
    },
    resolvedScaffold: { id: "landing-page" },
    promptSize: {
      total: { chars: 10, estimatedTokens: 3 },
      staticCore: { chars: 5, estimatedTokens: 2 },
      dynamicContext: { chars: 5, estimatedTokens: 1 },
      blocks: { largest: [] },
    },
    dynamicContextPruning: { budgetTokens: 100, usedTokens: 50, droppedBlockKeys: [] },
  } as unknown as GenerationInputPackage;
}

function lastFilesArg(): Record<string, string> {
  const call = writeLatestPromptDumpMock.mock.calls.at(-1);
  return call?.[1] as Record<string, string>;
}

describe("writeOrchestrationDynamicDump — prompt-dump gating", () => {
  beforeEach(() => {
    writeLatestPromptDumpMock.mockReset();
    isPromptDumpEnabledMock.mockReset();
    serializePackageForDumpMock.mockClear();
  });

  it("skips the heavy generation-input-package.json when dumping is disabled (prod path)", () => {
    isPromptDumpEnabledMock.mockReturnValue(false);
    writeOrchestrationDynamicDump(makePkg());
    expect(writeLatestPromptDumpMock).toHaveBeenCalledTimes(1);
    const files = lastFilesArg();
    expect(files["latest.md"]).toBe("DYNAMIC_CONTEXT_MARKER");
    expect(files).not.toHaveProperty("generation-input-package.json");
    // The expensive serialization must not run at all when the dump is disabled.
    expect(serializePackageForDumpMock).not.toHaveBeenCalled();
  });

  it("builds generation-input-package.json only when dumping is enabled", () => {
    isPromptDumpEnabledMock.mockReturnValue(true);
    writeOrchestrationDynamicDump(makePkg());
    const files = lastFilesArg();
    expect(files["latest.md"]).toBe("DYNAMIC_CONTEXT_MARKER");
    expect(files).toHaveProperty("generation-input-package.json");
    expect(typeof files["generation-input-package.json"]).toBe("string");
    expect(serializePackageForDumpMock).toHaveBeenCalledTimes(1);
  });
});
