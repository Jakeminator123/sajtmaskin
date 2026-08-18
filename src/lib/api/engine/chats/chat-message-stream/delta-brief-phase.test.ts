import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";

import { runClearRedesignDeltaBriefPhase } from "./delta-brief-phase";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";

// Delta-brief LLM pass: return a deterministic brief so the phase reaches the
// write-back branch without any network/model dependency.
vi.mock("@/lib/builder/site-brief-generation", () => ({
  tryGenerateServerAutoBrief: vi.fn(async () => ({
    brief: { projectTitle: "Fixture" },
    modelUsed: "fixture-model",
  })),
}));

// Scaffold pre-match surface. The import-lane contract under test is that
// NONE of these run in imported-repo mode.
vi.mock("@/lib/gen/scaffolds/matcher", () => ({
  matchScaffold: vi.fn(() => ({ id: "landing-scaffold", label: "Landing" })),
}));
vi.mock("@/lib/gen/scaffolds/registry", () => ({
  getScaffoldById: vi.fn(() => ({ id: "landing-scaffold", label: "Landing" })),
}));
vi.mock("@/lib/gen/scaffold-variants", () => ({
  pickScaffoldVariant: vi.fn(() => ({
    id: "variant-a",
    scaffoldId: "landing-scaffold",
    colorMode: "light",
    signatureMotif: "gradient",
    fontPairings: [],
  })),
}));
vi.mock("@/lib/gen/scaffold-variants/variant-hints", () => ({
  buildVariantHintsForBrief: vi.fn((scaffold, variant) =>
    scaffold && variant ? { scaffoldLabel: "Landing" } : null,
  ),
  formatVariantHintsForPrompt: vi.fn(() => "VARIANT HINTS"),
}));

import { tryGenerateServerAutoBrief } from "@/lib/builder/site-brief-generation";
import { matchScaffold } from "@/lib/gen/scaffolds/matcher";
import { pickScaffoldVariant } from "@/lib/gen/scaffold-variants";

function engineChatFixture(overrides: Partial<ChatWithMessages> = {}): ChatWithMessages {
  return {
    id: "chat_1",
    scaffold_id: null,
    orchestration_snapshot: null,
    messages: [],
    ...overrides,
  } as unknown as ChatWithMessages;
}

function parsedMetaFixture(): ParsedChatRequestMeta {
  return { brief: null } as unknown as ParsedChatRequestMeta;
}

function basePhaseParams(overrides: Record<string, unknown> = {}) {
  return {
    chatId: "chat_1",
    engineChat: engineChatFixture(),
    followUpIntent: "clear-redesign" as const,
    hasFollowUpBase: true,
    followUpIntentMessage: "Gör om hela sajten till en mörk portfolio",
    message: "Gör om hela sajten till en mörk portfolio",
    importedRepoMode: false,
    requestPromptSource: null,
    metaScaffoldMode: "auto" as const,
    metaScaffoldId: null,
    metaBuildIntent: null,
    metaPromptAssistModel: null,
    resolvedModelTier: "premium" as never,
    resolvedImageGenerations: false,
    req: new Request("http://localhost/test"),
    parsedMeta: parsedMetaFixture(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(tryGenerateServerAutoBrief).mockClear();
  vi.mocked(matchScaffold).mockClear();
  vi.mocked(pickScaffoldVariant).mockClear();
});

describe("runClearRedesignDeltaBriefPhase — imported repo mode", () => {
  it("skips scaffold/variant pre-match entirely but still generates the delta-brief", async () => {
    const params = basePhaseParams({ importedRepoMode: true });
    const result = await runClearRedesignDeltaBriefPhase(
      params as unknown as Parameters<typeof runClearRedesignDeltaBriefPhase>[0],
    );

    // The brief still runs — clear-redesign is the explicit rebuild signal —
    // but no Sajtmaskin scaffold is matched onto the imported repo.
    expect(matchScaffold).not.toHaveBeenCalled();
    expect(pickScaffoldVariant).not.toHaveBeenCalled();
    expect(tryGenerateServerAutoBrief).toHaveBeenCalledTimes(1);
    expect(vi.mocked(tryGenerateServerAutoBrief).mock.calls[0][0]).toMatchObject({
      variantHints: undefined,
    });
    expect(result.brief).toEqual({ projectTitle: "Fixture" });
    // Write-back contract (5-4/F1) still holds for imported repos.
    expect(
      (params.parsedMeta as unknown as { brief: unknown }).brief,
    ).toEqual({ projectTitle: "Fixture" });
  });

  it("normal mode without persisted scaffold keeps the keyword pre-match + variant hints", async () => {
    const params = basePhaseParams({ importedRepoMode: false });
    await runClearRedesignDeltaBriefPhase(
      params as unknown as Parameters<typeof runClearRedesignDeltaBriefPhase>[0],
    );

    expect(matchScaffold).toHaveBeenCalledTimes(1);
    expect(pickScaffoldVariant).toHaveBeenCalledTimes(1);
    expect(vi.mocked(tryGenerateServerAutoBrief).mock.calls[0][0]).toMatchObject({
      variantHints: "VARIANT HINTS",
    });
  });

  it("neutral follow-ups never run the delta-brief (unchanged)", async () => {
    const params = basePhaseParams({
      importedRepoMode: true,
      followUpIntent: "neutral" as const,
    });
    const result = await runClearRedesignDeltaBriefPhase(
      params as unknown as Parameters<typeof runClearRedesignDeltaBriefPhase>[0],
    );

    expect(tryGenerateServerAutoBrief).not.toHaveBeenCalled();
    expect(result.brief).toBeNull();
  });
});
