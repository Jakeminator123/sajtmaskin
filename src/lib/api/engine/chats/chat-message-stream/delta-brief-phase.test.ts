import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";
import { buildFollowUpContract } from "@/lib/gen/orchestration-snapshot";
import { resolveOrchestrationBase } from "@/lib/gen/orchestrate/resolve-base";
import { shouldIgnorePersistedScaffoldForMatch } from "@/lib/providers/own-engine/follow-up-clarification";

import { runClearRedesignDeltaBriefPhase } from "./delta-brief-phase";
import { parseChatRequestMeta, type ParsedChatRequestMeta } from "../parse-chat-request-meta";

// Delta-brief LLM pass: return a deterministic brief so the phase reaches the
// write-back branch without any network/model dependency.
vi.mock("@/lib/builder/site-brief-generation", () => ({
  tryGenerateServerAutoBrief: vi.fn(async () => ({
    brief: { projectTitle: "Fixture" },
    modelUsed: "fixture-model",
  })),
}));

vi.mock("@/lib/gen/data/shadcn-ui-recipes", () => ({
  resolveShadcnUiRecipes: vi.fn(async () => []),
}));

// Scaffold pre-match surface. The import-lane contract under test is that
// NONE of these run in imported-repo mode.
vi.mock("@/lib/gen/scaffolds/matcher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gen/scaffolds/matcher")>();
  return { ...actual, matchScaffold: vi.fn(actual.matchScaffold) };
});
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
  return parseChatRequestMeta({ buildMethod: "freeform" });
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
  it.each([
    ["persisted landing", "landing-page", null, "app-shell"],
    ["snapshot-only landing", null, { scaffoldId: "landing-page" }, "app-shell"],
    ["accepted website landing", "landing-page", { buildIntent: "website" }, "landing-page"],
    ["accepted snapshot-only website", null, { scaffoldId: "landing-page", buildIntent: "website" }, "landing-page"],
    ["multi-intent website", "auth-pages", { buildIntent: "website" }, "auth-pages"],
    ["multi-intent app", "auth-pages", { buildIntent: "app" }, "auth-pages"],
    ["invalid prior intent", "landing-page", { buildIntent: "invalid" }, "app-shell"],
    ["incompatible prior intent", "landing-page", { buildIntent: "app" }, "app-shell"],
    ["matching persisted dashboard", "dashboard", null, "dashboard"],
    ["no frozen scaffold", null, null, "dashboard"],
  ] as const)(
    "%s sends the same manual-redesign scaffold to the brief and final resolver",
    async (_label, persistedScaffoldId, snapshot, expected) => {
      const parsedMeta = parseChatRequestMeta({
        buildMethod: "freeform",
        buildIntent: "website",
        scaffoldMode: "manual",
        scaffoldId: "dashboard",
      });
      const message = "Bygg om hela sajten till en landing page med hero och call to action";
      const engineChat = engineChatFixture({
        scaffold_id: persistedScaffoldId,
        orchestration_snapshot: snapshot,
      });
      await runClearRedesignDeltaBriefPhase(
        basePhaseParams({
          engineChat,
          parsedMeta,
          message,
          followUpIntentMessage: message,
          metaBuildIntent: parsedMeta.buildIntent,
          metaScaffoldMode: parsedMeta.scaffoldMode,
          metaScaffoldId: parsedMeta.scaffoldId,
        }),
      );
      const briefScaffoldId = vi.mocked(pickScaffoldVariant).mock.calls[0]?.[0].scaffoldId;
      const ignorePersistedScaffoldForMatch = shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "clear-redesign",
        message,
        scaffoldMode: parsedMeta.scaffoldMode,
        scaffoldId: parsedMeta.scaffoldId,
      });
      const base = await resolveOrchestrationBase({
        prompt: message,
        buildMethod: parsedMeta.buildMethod,
        buildIntent: parsedMeta.buildIntent,
        buildIntentExplicit: parsedMeta.buildIntentExplicit,
        scaffoldMode: parsedMeta.scaffoldMode,
        scaffoldId: parsedMeta.scaffoldId,
        persistedScaffoldId,
        generationMode: "followUp",
        previousFilesCount: 12,
        ignorePersistedScaffoldForMatch,
        followUpIntent: "clear-redesign",
        followUpContract: buildFollowUpContract({ snapshot, persistedScaffoldId }),
        embeddingScaffoldMatch: false,
      });
      expect(ignorePersistedScaffoldForMatch).toBe(false);
      expect(base.resolvedScaffold?.id).toBe(expected);
      expect(briefScaffoldId).toBe(base.resolvedScaffold?.id);
      expect(parsedMeta.brief).toEqual({ projectTitle: "Fixture" });
    },
  );

  it("neutral manual follow-up retains the final freeze and never creates a delta-brief", async () => {
    const parsedMeta = parseChatRequestMeta({
      buildMethod: "freeform",
      buildIntent: "website",
      scaffoldMode: "manual",
      scaffoldId: "dashboard",
    });
    const message = "Justera färgen";
    await runClearRedesignDeltaBriefPhase(
      basePhaseParams({
        engineChat: engineChatFixture({ scaffold_id: "landing-page", orchestration_snapshot: { buildIntent: "website" } }),
        followUpIntent: "neutral",
        followUpIntentMessage: message,
        message,
        parsedMeta,
        metaScaffoldMode: parsedMeta.scaffoldMode,
        metaScaffoldId: parsedMeta.scaffoldId,
      }),
    );
    const base = await resolveOrchestrationBase({
      prompt: message,
      buildMethod: parsedMeta.buildMethod,
      buildIntent: parsedMeta.buildIntent,
      scaffoldMode: parsedMeta.scaffoldMode,
      scaffoldId: parsedMeta.scaffoldId,
      persistedScaffoldId: "landing-page",
      generationMode: "followUp",
      previousFilesCount: 12,
      ignorePersistedScaffoldForMatch: false,
      followUpIntent: "neutral",
      followUpContract: buildFollowUpContract({ snapshot: { buildIntent: "website" }, persistedScaffoldId: "landing-page" }),
      embeddingScaffoldMatch: false,
    });
    expect(base.resolvedScaffold?.id).toBe("landing-page");
    expect(tryGenerateServerAutoBrief).not.toHaveBeenCalled();
    expect(pickScaffoldVariant).not.toHaveBeenCalled();
    expect(parsedMeta.brief).toBeNull();
  });

  it.each([
    ["audit", { buildMethod: "audit" }, "landing-page"],
    ["kostnadsfri", { buildMethod: "kostnadsfri" }, "landing-page"],
    ["category", { buildMethod: "category" }, "landing-page"],
    ["explicit website", { buildIntentExplicit: true }, "landing-page"],
    ["implicit freeform", {}, "dashboard"],
    ["template off", { buildIntent: "template", scaffoldMode: "off" }, null],
    ["category off", { buildMethod: "category", scaffoldMode: "off" }, null],
    ["website off", { scaffoldMode: "off" }, "projekt-bas-app"],
    ["app off", { buildIntent: "app", scaffoldMode: "off" }, "projekt-bas-app"],
    ["manual dashboard", { scaffoldMode: "manual", scaffoldId: "dashboard" }, "dashboard"],
  ] as const)(
    "%s reaches the actual delta-brief with intent-safe hints",
    async (_label, selection, expected) => {
      const parsedMeta = parseChatRequestMeta({
        buildMethod: "freeform",
        buildIntent: "website",
        scaffoldMode: "auto",
        ...selection,
      });
      const message =
        parsedMeta.scaffoldMode === "manual"
          ? "Bygg om hela sajten till en landing page med hero och call to action"
          : "Bygg om hela projektet till en dashboard med analytics, charts, metrics, kpi och reports";
      await runClearRedesignDeltaBriefPhase(
        basePhaseParams({
          parsedMeta,
          message,
          followUpIntentMessage: message,
          metaBuildIntent: parsedMeta.buildIntent,
          metaScaffoldMode: parsedMeta.scaffoldMode,
          metaScaffoldId: parsedMeta.scaffoldId,
        }),
      );
      expect(tryGenerateServerAutoBrief).toHaveBeenCalledTimes(1);
      if (expected) {
        expect(pickScaffoldVariant).toHaveBeenCalledExactlyOnceWith({
          prompt: message,
          scaffoldId: expected,
        });
        expect(vi.mocked(tryGenerateServerAutoBrief).mock.calls[0][0].variantHints).toBe(
          "VARIANT HINTS",
        );
      } else {
        expect(pickScaffoldVariant).not.toHaveBeenCalled();
        expect(vi.mocked(tryGenerateServerAutoBrief).mock.calls[0][0].variantHints).toBeUndefined();
      }
      expect(parsedMeta.brief).toEqual({ projectTitle: "Fixture" });
    },
  );

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
    expect((params.parsedMeta as unknown as { brief: unknown }).brief).toEqual({
      projectTitle: "Fixture",
    });
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
