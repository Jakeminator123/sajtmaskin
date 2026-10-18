import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/db/chat-repository-pg", () => ({ addMessage: vi.fn() }));
vi.mock("@/lib/gen/orchestrate", () => ({ resolveOrchestrationBase: vi.fn() }));
vi.mock("../configured-env-keys", () => ({
  resolveConfiguredEnvKeys: vi.fn(async () => new Set<string>()),
}));
vi.mock("../request-kind-log", () => ({
  logRequestKindClassification: vi.fn(() => ({ kind: "code-edit" })),
}));
vi.mock("@/lib/models/phase-routing", () => ({
  resolvePhaseModel: vi.fn(() => ({ modelId: "gpt-5.4" })),
}));
vi.mock("@/lib/own-engine/session/own-engine-pipeline-generation", () => ({
  createOwnEnginePipelineAndGenerationStream: vi.fn(),
}));
vi.mock("./qa-short-circuit", () => ({
  generateQaShortCircuitText: vi.fn(),
  buildQaShortCircuitStream: vi.fn(),
}));

import { resolveOrchestrationBase } from "@/lib/gen/orchestrate";
import { createOwnEnginePipelineAndGenerationStream } from "@/lib/own-engine/session/own-engine-pipeline-generation";
import { parseChatRequestMeta } from "../parse-chat-request-meta";
import { runCodegenTurn } from "./codegen-turn";
import { orchestratePromptMessage } from "@/lib/builder/prompt-orchestration";

const stopAtBoundary = new Error("keyless orchestration boundary captured");

function params(
  buildMethod: string,
  importedRepoMode = false,
): Parameters<typeof runCodegenTurn>[0] {
  const parsedMeta = parseChatRequestMeta({
    buildMethod,
    buildIntent: "website",
    scaffoldMode: "manual",
    scaffoldId: "dashboard",
  });
  return {
    req: new Request("https://example.com/api/engine/chats/test/stream"),
    chatId: "test",
    promptStartedAt: 0,
    attachSessionCookie: (response) => response,
    engineChat: {
      id: "test", project_id: "app_test", messages: [], orchestration_snapshot: null,
      title: "Test", model: "max", system_prompt: null, scaffold_id: null,
      created_at: "1970-01-01T00:00:00Z", updated_at: "1970-01-01T00:00:00Z",
    },
    message: "Byt rubriken",
    optimizedMessage: "Byt rubriken",
    followUpIntentMessage: "Byt rubriken",
    system: undefined,
    metaBuildIntent: parsedMeta.buildIntent,
    metaBuildMethod: parsedMeta.buildMethod,
    metaPromptSourceKind: null,
    metaEngineBaseVersionId: null,
    parsedMeta,
    metaBrief: null,
    deltaBriefSkipReason: null,
    hasPersistedBrief: false,
    resolvedModelId: "max",
    resolvedModelTier: "max",
    resolvedThinking: false,
    resolvedImageGenerations: false,
    buildProfileId: "max",
    requestAttachments: [],
    designReferences: [],
    promptOrchestration: orchestratePromptMessage({
      message: "Byt rubriken",
      isFirstPrompt: false,
    }),
    previousFiles: [],
    hasFollowUpBase: false,
    existingRoutePaths: [],
    existingShellRoutePaths: [],
    followUpCapabilityDetection: {
      capabilities: [],
      capabilityIds: [],
      tierByCapability: {},
      wordCount: 0,
      referencesExistingCapability: false,
      modifyReferenceMatches: [],
    },
    followUpIntent: "neutral",
    persistedScaffoldId: null,
    importedRepoMode,
    ignorePersistedScaffoldForMatch: false,
    f3ContinuationDecision: null,
    f3ApprovalBuildRound: false,
    f3ApprovedDossierCapabilities: [],
    f3EffectiveApprovedProviders: [],
    fileDerivedTier3BuildSpec: null,
    f3ResolvedBaseVersionId: null,
    commitCreditsOnce: vi.fn(),
    prewarmLeaseKey: "test",
    versionsQuerySucceeded: true,
    existingVersionsForChat: [],
  };
}

describe("codegen consumes the same effective metadata without late promotion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveOrchestrationBase).mockRejectedValue(stopAtBoundary);
  });
  it.each([
    ["freeform", "app"],
    ["audit", "website"],
    ["kostnadsfri", "website"],
    ["category", "template"],
  ])("forwards %s as %s", async (method, intent) => {
    await expect(runCodegenTurn(params(method))).rejects.toBe(stopAtBoundary);
    expect(vi.mocked(resolveOrchestrationBase).mock.calls[0][0]).toMatchObject({
      buildMethod: method,
      buildIntent: intent,
      scaffoldMode: "manual",
      scaffoldId: "dashboard",
    });
    expect(createOwnEnginePipelineAndGenerationStream).not.toHaveBeenCalled();
  });
  it("keeps import mode scaffold-less despite a stale manual app selection", async () => {
    await expect(runCodegenTurn(params("audit", true))).rejects.toBe(stopAtBoundary);
    expect(vi.mocked(resolveOrchestrationBase).mock.calls[0][0]).toMatchObject({
      importedRepoMode: true,
      scaffoldMode: "off",
      scaffoldId: null,
      buildIntent: "website",
    });
  });
});
