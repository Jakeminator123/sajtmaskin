import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolvePostFinalizeServerVerifyDecision,
  shouldTriggerPostFinalizeServerVerify,
} from "@/lib/gen/stream/post-finalize-policies";
import { runOwnEngineStreamPostFinalize } from "./generation-stream-post-finalize";

const isServerVerifyEligible = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const updateVersionSandboxUrl = vi.hoisted(() => vi.fn());
const parseCodeProjectMock = vi.hoisted(() =>
  vi.fn((_src: string) => ({ files: [] as Array<{ path: string; content: string }> })),
);
const shouldRunOwnEngineSandbox = vi.hoisted(() => vi.fn(() => false));
const logSandboxLifecycleTelemetry = vi.hoisted(() => vi.fn());
const startSandboxPreview = vi.hoisted(() => vi.fn());
const isTier2PreviewConfigured = vi.hoisted(() => vi.fn(() => false));
const devLogAppend = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getChat,
  updateVersionSandboxUrl,
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend,
  devLogFinalizeSite: vi.fn(),
}));

vi.mock("@/lib/gen/sandbox/own-engine-sandbox-gate", () => ({
  shouldRunOwnEngineSandbox,
}));

vi.mock("@/lib/gen/parser", () => ({
  parseCodeProject: (src: string) => parseCodeProjectMock(src),
}));

vi.mock("@/lib/gen/sandbox/lifecycle-telemetry", () => ({
  logSandboxLifecycleTelemetry,
}));

vi.mock("@/lib/gen/sandbox/sandbox-preview", () => ({
  startSandboxPreview,
}));

vi.mock("@/lib/gen/stream/shared-own-engine-helpers", () => ({
  getUnsignaledDetectedIntegrations: vi.fn(() => []),
}));

vi.mock("@/lib/gen/version-manager", () => ({
  parseCodeFilesFromFilesJson: vi.fn(() => []),
}));

vi.mock("@/lib/gen/sandbox/tier2-config", () => ({
  isTier2PreviewConfigured,
}));

vi.mock("@/lib/gen/server-verify", () => ({
  isServerVerifyEligible,
  triggerServerVerification: vi.fn(),
}));

vi.mock("@/lib/streaming", () => ({
  formatSSEEvent: vi.fn(() => ""),
}));

vi.mock("@/lib/utils/debug", () => ({
  warnLog: vi.fn(),
}));

const finalized = {
  version: { id: "ver_1" },
  messageId: "msg_1",
  previewUrl: null,
  sandboxUrl: null,
  filesJson: "[]",
  contentForVersion: "",
  preflight: {
    previewBlocked: false,
    verificationBlocked: false,
    previewBlockingReason: null,
    sandbox: {
      canStartSandbox: true,
      primaryPreviewTarget: "app",
      shimBlocked: false,
      requiresEnvConfig: false,
      hasCriticalInstallRisk: false,
      hasCriticalCodeFailure: false,
      compatibilityShimAllowed: false,
      issueCounts: {
        code_structure_failure: 0,
        dependency_install_failure: 0,
        env_config_missing: 0,
        shim_preview_failure: 0,
        non_blocking_quality_warning: 0,
      },
      blockingCategories: [],
    },
  },
} as const;

describe("runOwnEngineStreamPostFinalize (stream recovery)", () => {
  beforeEach(() => {
    getChat.mockReset();
    updateVersionSandboxUrl.mockReset();
    parseCodeProjectMock.mockReset();
    parseCodeProjectMock.mockImplementation(() => ({ files: [] }));
    shouldRunOwnEngineSandbox.mockReset();
    shouldRunOwnEngineSandbox.mockReturnValue(false);
    logSandboxLifecycleTelemetry.mockReset();
    startSandboxPreview.mockReset();
    isTier2PreviewConfigured.mockReset();
    isTier2PreviewConfigured.mockReturnValue(false);
  });

  it("parses accumulatedContent when recovery flag is set and saved files are empty", async () => {
    const marker = "RECOVERY_PARSE_MARKER";
    parseCodeProjectMock.mockImplementation((src: string) =>
      src.includes(marker)
        ? { files: [{ path: "app/page.tsx", content: "export default function Page(){return null}" }] }
        : { files: [] },
    );

    await runOwnEngineStreamPostFinalize({
      sse: { enc: new TextEncoder(), safeEnqueue: () => {} },
      chatId: "chat_1",
      finalized: finalized as never,
      accumulatedContent: `prefix ${marker}`,
      toolSignaledProviders: new Set(),
      engineStartedAt: Date.now(),
      commitCredits: async () => {},
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldFamily: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "fast",
        contextPolicy: "light",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 12_000,
          refsChars: 4_000,
          systemContextChars: 18_000,
        },
      },
      recoveredAfterStreamAbort: true,
    });

    expect(parseCodeProjectMock.mock.calls.some((c) => String(c[0]).includes(marker))).toBe(true);
  });

  it("logs structured sandbox readiness telemetry with policy context", async () => {
    shouldRunOwnEngineSandbox.mockReturnValue(true);
    isTier2PreviewConfigured.mockReturnValue(true);
    getChat.mockResolvedValue({ project_id: "proj_1" });
    startSandboxPreview.mockResolvedValue({
      ok: true,
      result: {
        sandboxUrl: "https://sandbox.example",
        sandboxId: "sbx_1",
        sandboxPreviewMode: "dev_then_build",
        fidelityTier: 3,
        prodBuildVerified: true,
        startOutcome: "recreated",
      },
    });

    await runOwnEngineStreamPostFinalize({
      sse: { enc: new TextEncoder(), safeEnqueue: () => {} },
      chatId: "chat_1",
      finalized: finalized as never,
      accumulatedContent: "prefix",
      toolSignaledProviders: new Set(),
      engineStartedAt: Date.now() - 250,
      commitCredits: async () => {},
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldFamily: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "release-candidate",
        previewPolicy: "fidelity3",
        verificationPolicy: "strict",
        contextPolicy: "heavy",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 25_000,
          refsChars: 12_000,
          systemContextChars: 36_000,
        },
      },
    });

    expect(startSandboxPreview).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        appProjectId: "proj_1",
        chatId: "chat_1",
        previewPolicy: "fidelity3",
        verificationPolicy: "strict",
        versionIdForSession: "ver_1",
      }),
    );
    expect(logSandboxLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "sandbox_start_outcome",
        chatId: "chat_1",
        versionId: "ver_1",
        outcome: "recreated",
        previewPolicy: "fidelity3",
        verificationPolicy: "strict",
      }),
    );
    expect(logSandboxLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "sandbox_preview_ready",
        chatId: "chat_1",
        versionId: "ver_1",
        sandboxId: "sbx_1",
        sandboxPreviewMode: "dev_then_build",
        fidelityTier: 3,
        prodBuildVerified: true,
        previewPolicy: "fidelity3",
        verificationPolicy: "strict",
        startOutcome: "recreated",
        msSinceEngineStart: expect.any(Number),
      }),
    );
    expect(updateVersionSandboxUrl).toHaveBeenCalledWith("ver_1", "https://sandbox.example");
  });
});

describe("shouldTriggerPostFinalizeServerVerify", () => {
  beforeEach(() => {
    isServerVerifyEligible.mockReset();
    isServerVerifyEligible.mockReturnValue(true);
    devLogAppend.mockReset();
  });

  it("skips background verify for fast follow-up policy", () => {
    expect(
      shouldTriggerPostFinalizeServerVerify({
        buildSpec: {
          buildIntent: "website",
          generationMode: "followUp",
          changeScope: "copy",
          scaffoldFamily: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "fast",
          contextPolicy: "light",
          referenceCategories: [],
          forbiddenPatterns: [],
          tokenBudgets: {
            scaffoldChars: 12_000,
            refsChars: 4_000,
            systemContextChars: 18_000,
          },
        },
        finalized: finalized as never,
      }),
    ).toBe(false);
  });

  it("allows verify for standard policy when version is eligible", () => {
    expect(
      shouldTriggerPostFinalizeServerVerify({
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldFamily: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "premium",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: [],
          forbiddenPatterns: [],
          tokenBudgets: {
            scaffoldChars: 20_000,
            refsChars: 8_000,
            systemContextChars: 28_000,
          },
        },
        finalized: finalized as never,
      }),
    ).toBe(true);
  });

  it("skips low-risk standard website flows when nothing indicates extra verify value", () => {
    expect(
      shouldTriggerPostFinalizeServerVerify({
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldFamily: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: [],
          forbiddenPatterns: [],
          tokenBudgets: {
            scaffoldChars: 20_000,
            refsChars: 8_000,
            systemContextChars: 28_000,
          },
        },
        finalized: finalized as never,
      }),
    ).toBe(false);
  });

  it("reports why background verify is skipped for low-risk standard flows", () => {
    expect(
      resolvePostFinalizeServerVerifyDecision({
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldFamily: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: [],
          forbiddenPatterns: [],
          tokenBudgets: {
            scaffoldChars: 20_000,
            refsChars: 8_000,
            systemContextChars: 28_000,
          },
        },
        finalized: finalized as never,
      }),
    ).toEqual({
      run: false,
      reason: "low_risk_standard_flow",
    });
  });
});

describe("runOwnEngineStreamPostFinalize server verify policy logging", () => {
  beforeEach(() => {
    devLogAppend.mockReset();
    isServerVerifyEligible.mockReset();
    isServerVerifyEligible.mockReturnValue(true);
  });

  it("logs when background verify is skipped for a low-risk standard flow", async () => {
    await runOwnEngineStreamPostFinalize({
      sse: { enc: new TextEncoder(), safeEnqueue: () => {} },
      chatId: "chat_1",
      finalized: finalized as never,
      accumulatedContent: "prefix",
      toolSignaledProviders: new Set(),
      engineStartedAt: Date.now(),
      commitCredits: async () => {},
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldFamily: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 20_000,
          refsChars: 8_000,
          systemContextChars: 28_000,
        },
      },
    });

    expect(devLogAppend).toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({
        type: "server-verify.policy",
        run: false,
        reason: "low_risk_standard_flow",
      }),
    );
  });
});
