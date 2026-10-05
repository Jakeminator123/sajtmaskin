// Drive the real create handler through its pre-brief boundary. Only external
// admission/context and downstream generation are stubbed; scaffold matching,
// request intent, variants and hint formatting remain the production owners.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _key: string, run: () => unknown) => run(),
}));
vi.mock("@/lib/gen/stream/generation-work", () => ({
  runWithGenerationWork: (run: (done: () => Promise<void>) => unknown) =>
    run(() => Promise.resolve()),
}));
vi.mock("@/lib/observability/llm-usage", () => ({
  runWithLlmUsageContext: (_context: unknown, run: () => unknown) => run(),
  setLlmUsageContext: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  ensureSessionIdFromRequest: () => ({ sessionId: "fixture-session" }),
}));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/lib/bot-protection", () => ({ requireNotBot: () => null }));
vi.mock("@/lib/tenant", () => ({ resolveAppProjectIdForRequest: vi.fn(async () => null) }));
vi.mock("@/lib/credits/generation-admission", () => ({
  prepareGenerationCredits: vi.fn(async () => ({
    ok: true,
    user: { id: "fixture-user" },
    generationLock: null,
  })),
}));
vi.mock("@/lib/builder/audit-handoff-resolve", () => ({
  resolveAuditHandoffForOwner: vi.fn(async () => null),
}));
vi.mock("@/lib/kostnadsfri/wizard-snapshot-resolve", () => ({
  resolveKostnadsfriWizardSnapshotForOwner: vi.fn(async () => null),
}));
vi.mock("@/lib/media/rehost-remote-image", () => ({ rehostAuditSourceImages: vi.fn() }));
vi.mock("@/lib/gen/attachment-text-hydrate", () => ({
  appendHydratedTextAttachmentExcerpts: vi.fn(async (prompt: string) => prompt),
}));
vi.mock("@/lib/gen/preview/preview-prewarm", () => ({
  createPreviewPrewarmLeaseKey: () => "fixture-lease",
  prewarmPreviewSession: vi.fn(),
}));
vi.mock("@/lib/gen/stream/generation-lock", () => ({
  bindUserGenerationLockToResponse: (response: Response) => response,
  acquireChatGenerationLock: vi.fn(),
  bindChatGenerationLockToResponse: vi.fn(),
  chatGenerationLockFailureResponse: vi.fn(),
  releaseChatGenerationLock: vi.fn(),
}));
vi.mock("./stream-error-response", () => ({
  buildEngineStreamResponse: vi.fn(),
  buildStreamErrorResponse: () =>
    new Response("stopped at keyless brief boundary", { status: 500 }),
}));
vi.mock("@/lib/builder/server-auto-brief-policy", () => ({
  shouldRunServerAutoBrief: () => true,
  createServerAutoBriefSignal: (signal: AbortSignal) => signal,
}));
vi.mock("@/lib/builder/site-brief-generation", () => ({
  tryGenerateServerAutoBrief: vi.fn(async () => {
    throw new Error("keyless brief boundary");
  }),
}));
vi.mock("@/lib/gen/scaffold-variants/variant-hints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gen/scaffold-variants/variant-hints")>();
  return { ...actual, buildVariantHintsForBrief: vi.fn(actual.buildVariantHintsForBrief) };
});
vi.mock("@/lib/db/chat-repository-pg", () => ({ createChat: vi.fn() }));
vi.mock("@/lib/db/services/kostnadsfri-campaign", () => ({
  bindKostnadsfriCampaignInitialChat: vi.fn(),
}));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn(), devLogStartNewSite: vi.fn() }));
vi.mock("@/lib/utils/debug", () => ({ debugLog: vi.fn() }));
vi.mock("./create-chat-prompt-log", () => ({
  attachCreateChatPromptLogChatId: vi.fn(),
  recordCreateChatPromptLog: vi.fn(),
}));
vi.mock("./credits-handler", () => ({ createCommitCreditsOnce: vi.fn() }));
vi.mock("./configured-env-keys", () => ({ resolveConfiguredEnvKeys: vi.fn() }));
vi.mock("@/lib/gen/orchestrate", () => ({
  buildGenerationInputPackage: vi.fn(),
  finalizeOrchestrationPrompts: vi.fn(),
  prepareGenerationContext: vi.fn(),
  resolveOrchestrationBase: vi.fn(),
  writeOrchestrationDynamicDump: vi.fn(),
}));
vi.mock("@/lib/own-engine/session/own-engine-pipeline-generation", () => ({
  createOwnEnginePipelineAndGenerationStream: vi.fn(),
}));
vi.mock("@/lib/own-engine/session/own-engine-build-session", () => ({
  buildOwnEngineGenerationStreamMeta: vi.fn(),
}));
vi.mock("@/lib/own-engine/session/own-engine-plan-mode", () => ({
  computePlanModePlannerPrompts: vi.fn(),
  dumpPlanModePlannerPrompts: vi.fn(),
  logPlanModeGenerationStart: vi.fn(),
  resolvePlanModePlannerSettings: vi.fn(),
}));
vi.mock("./create-chat-plan-mode-trace", () => ({
  startTracedCreateChatPlanModeResponse: vi.fn(),
}));

import { tryGenerateServerAutoBrief } from "@/lib/builder/site-brief-generation";
import { buildVariantHintsForBrief } from "@/lib/gen/scaffold-variants/variant-hints";
import { handleCreateChatStreamPost } from "./create-chat-stream-post";

const landingPrompt = "Bygg en landing page med hero och call to action för ett lokalt företag";
const dashboardPrompt = "Bygg en dashboard med analytics, charts, metrics, kpi och reports";

beforeEach(() => vi.clearAllMocks());

describe("create handler — actual scaffold/variant hints before the brief", () => {
  it.each([
    [
      "stale auto id",
      landingPrompt,
      { scaffoldMode: "auto", scaffoldId: "dashboard" },
      "landing-page",
    ],
    ["template off", dashboardPrompt, { buildIntent: "template", scaffoldMode: "off" }, null],
    ["category off", dashboardPrompt, { buildMethod: "category", scaffoldMode: "off" }, null],
    [
      "website off",
      dashboardPrompt,
      { scaffoldMode: "off", scaffoldId: "dashboard" },
      "projekt-bas-app",
    ],
    ["app off", dashboardPrompt, { buildIntent: "app", scaffoldMode: "off" }, "projekt-bas-app"],
    [
      "manual dashboard promotion",
      landingPrompt,
      { scaffoldMode: "manual", scaffoldId: "dashboard" },
      "dashboard",
    ],
    ["implicit auto promotion", dashboardPrompt, { scaffoldMode: "auto" }, "dashboard"],
    [
      "explicit website clamp",
      dashboardPrompt,
      { scaffoldMode: "auto", buildIntentExplicit: true },
      "landing-page",
    ],
    [
      "audit clamp",
      dashboardPrompt,
      { buildMethod: "audit", scaffoldMode: "auto" },
      "landing-page",
    ],
    [
      "kostnadsfri clamp",
      dashboardPrompt,
      { buildMethod: "kostnadsfri", scaffoldMode: "auto" },
      "landing-page",
    ],
  ] as const)("%s", async (_label, message, selection, expectedScaffold) => {
    await handleCreateChatStreamPost(
      new Request("https://example.com/api/engine/chats/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          thinking: false,
          meta: {
            buildMethod: "freeform",
            buildIntent: "website",
            ...selection,
          },
        }),
      }),
    );
    expect(buildVariantHintsForBrief).toHaveBeenCalledTimes(1);
    const [scaffold, variant] = vi.mocked(buildVariantHintsForBrief).mock.calls[0];
    expect(scaffold?.id ?? null).toBe(expectedScaffold);
    expect(variant?.scaffoldId ?? null).toBe(expectedScaffold);
    expect(tryGenerateServerAutoBrief).toHaveBeenCalledTimes(1);
    const briefInput = vi.mocked(tryGenerateServerAutoBrief).mock.calls[0][0];
    if (expectedScaffold) expect(briefInput.variantHints).toContain(scaffold!.label);
    else expect(briefInput.variantHints).toBeUndefined();
  });
});
