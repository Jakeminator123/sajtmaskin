import { beforeEach, describe, expect, it, vi } from "vitest";
import { shouldTriggerPostFinalizeServerVerify } from "@/lib/gen/stream/post-finalize-policies";
import { runOwnEngineStreamPostFinalize } from "./generation-stream-post-finalize";

const isServerVerifyEligible = vi.hoisted(() => vi.fn());
const parseCodeProjectMock = vi.hoisted(() =>
  vi.fn((_src: string) => ({ files: [] as Array<{ path: string; content: string }> })),
);

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getChat: vi.fn(),
  updateVersionSandboxUrl: vi.fn(),
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
  devLogFinalizeSite: vi.fn(),
}));

vi.mock("@/lib/gen/own-engine-sandbox-gate", () => ({
  shouldRunOwnEngineSandbox: vi.fn(() => false),
}));

vi.mock("@/lib/gen/parser", () => ({
  parseCodeProject: (src: string) => parseCodeProjectMock(src),
}));

vi.mock("@/lib/gen/sandbox-lifecycle-telemetry", () => ({
  logSandboxLifecycleTelemetry: vi.fn(),
}));

vi.mock("@/lib/gen/sandbox-preview", () => ({
  startSandboxPreview: vi.fn(),
}));

vi.mock("@/lib/gen/stream/shared-own-engine-helpers", () => ({
  getUnsignaledDetectedIntegrations: vi.fn(() => []),
}));

vi.mock("@/lib/gen/version-manager", () => ({
  parseCodeFilesFromFilesJson: vi.fn(() => []),
}));

vi.mock("@/lib/mcp/runtime-url", () => ({
  isSandboxConfigured: vi.fn(() => false),
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
    parseCodeProjectMock.mockReset();
    parseCodeProjectMock.mockImplementation(() => ({ files: [] }));
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
});

describe("shouldTriggerPostFinalizeServerVerify", () => {
  beforeEach(() => {
    isServerVerifyEligible.mockReset();
    isServerVerifyEligible.mockReturnValue(true);
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
});
