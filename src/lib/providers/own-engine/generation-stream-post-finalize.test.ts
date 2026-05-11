import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolvePostFinalizeServerVerifyDecision,
  shouldTriggerPostFinalizeServerVerify,
} from "@/lib/gen/stream/post-finalize-policies";
import { runOwnEngineStreamPostFinalize } from "./generation-stream-post-finalize";

const createEngineVersionErrorLogsMock = vi.hoisted(() =>
  vi.fn<(payloads: unknown[]) => Promise<void>>(async () => undefined),
);
const isServerVerifyEligible = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const updateVersionPreviewUrl = vi.hoisted(() => vi.fn());
const parseCodeProjectMock = vi.hoisted(() =>
  vi.fn((_src: string) => ({ files: [] as Array<{ path: string; content: string }> })),
);
const shouldStartOwnEnginePreview = vi.hoisted(() => vi.fn(() => false));
const logPreviewLifecycleTelemetryMock = vi.hoisted(() => vi.fn());
const startPreviewSessionMock = vi.hoisted(() => vi.fn());
const isTier2PreviewConfigured = vi.hoisted(() => vi.fn(() => false));
const getPreviewHostBaseUrl = vi.hoisted(() => vi.fn<() => string | null>(() => null));
const devLogAppend = vi.hoisted(() => vi.fn());
const formatSSEEventMock = vi.hoisted(() =>
  vi.fn((event: string, payload: unknown) => JSON.stringify({ event, payload })),
);

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getChat,
  updateVersionPreviewUrl,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs: createEngineVersionErrorLogsMock,
}));

vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get() { return vi.fn(); } }),
  dbConfigured: true,
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend,
  devLogFinalizeSite: vi.fn(),
}));

vi.mock("@/lib/gen/preview/should-start-preview", () => ({
  shouldStartOwnEnginePreview,
  // SAJ-61 c4: post-finalize-policies imports the build-breaking gate
  // via this module. Tests don't exercise the gate themselves so the
  // mock returns false (no gate firing), preserving existing semantics.
  hasBuildBreakingVerifierFindings: () => false,
  isBuildBreakingFinding: () => false,
}));

vi.mock("@/lib/gen/parser", () => ({
  parseCodeProject: (src: string) => parseCodeProjectMock(src),
}));

vi.mock("@/lib/gen/preview/lifecycle-telemetry", () => ({
  logPreviewLifecycleTelemetry: logPreviewLifecycleTelemetryMock,
}));

vi.mock("@/lib/gen/preview/preview-session", () => ({
  startPreviewSession: startPreviewSessionMock,
}));

vi.mock("@/lib/gen/stream/shared-own-engine-helpers", () => ({
  getUnsignaledDetectedIntegrations: vi.fn(() => []),
}));

vi.mock("@/lib/gen/version-manager", () => ({
  parseCodeFilesFromFilesJson: vi.fn(() => []),
}));

vi.mock("@/lib/gen/preview/tier2-config", () => ({
  isTier2PreviewConfigured,
  getPreviewHostBaseUrl,
}));

vi.mock("@/lib/gen/verify/server-verify", () => ({
  isServerVerifyEligible,
  triggerServerVerification: vi.fn(),
}));

vi.mock("@/lib/streaming", () => ({
  formatSSEEvent: formatSSEEventMock,
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  warnLog: vi.fn(),
}));

const finalized = {
  version: { id: "ver_1" },
  messageId: "msg_1",
  previewUrl: null,
  tier2PreviewUrl: null,
  filesJson: "[]",
  contentForVersion: "",
  preflight: {
    previewBlocked: false,
    verificationBlocked: false,
    previewBlockingReason: null,
    previewStart: {
      canStartPreview: true,
      primaryPreviewTarget: "preview",
      shimBlocked: false,
      requiresEnvConfig: false,
      hasCriticalInstallRisk: false,
      hasCriticalCodeFailure: false,
      compatibilityPreviewAllowed: false,
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
  rejectedShrinks: [],
  rejectedStructural: [],
  crossFileStubs: [],
} as const;

describe("runOwnEngineStreamPostFinalize (stream recovery)", () => {
  beforeEach(() => {
    getChat.mockReset();
    updateVersionPreviewUrl.mockReset();
    parseCodeProjectMock.mockReset();
    parseCodeProjectMock.mockImplementation(() => ({ files: [] }));
    shouldStartOwnEnginePreview.mockReset();
    shouldStartOwnEnginePreview.mockReturnValue(false);
    logPreviewLifecycleTelemetryMock.mockReset();
    startPreviewSessionMock.mockReset();
    isTier2PreviewConfigured.mockReset();
    isTier2PreviewConfigured.mockReturnValue(false);
    getPreviewHostBaseUrl.mockReset();
    getPreviewHostBaseUrl.mockReturnValue(null);
    updateVersionPreviewUrl.mockResolvedValue(true);
    formatSSEEventMock.mockClear();
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
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "fast",
        contextPolicy: "light",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
      },
      recoveredAfterStreamAbort: true,
    });

    expect(parseCodeProjectMock.mock.calls.some((c) => String(c[0]).includes(marker))).toBe(true);
  });

  it("logs structured tier-2 preview readiness telemetry with policy context", async () => {
    shouldStartOwnEnginePreview.mockReturnValue(true);
    isTier2PreviewConfigured.mockReturnValue(true);
    getPreviewHostBaseUrl.mockReturnValue("https://vm-fly-jakem.fly.dev");
    getChat.mockResolvedValue({ project_id: "proj_1" });
    startPreviewSessionMock.mockResolvedValue({
      ok: true,
      result: {
        sandboxUrl: "https://preview.example",
        sandboxId: "sbx_1",
        sandboxPreviewMode: "dev_only",
        fidelityTier: 2,
        startOutcome: "recreated",
        tier2Meta: { tier2Provider: "preview_host" },
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
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "release-candidate",
        previewPolicy: "fidelity3",
        verificationPolicy: "strict",
        contextPolicy: "heavy",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 80_000,
          refsChars: 40_000,
          systemContextChars: 160_000,
        },
      },
    });

    expect(startPreviewSessionMock).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        appProjectId: "proj_1",
        chatId: "chat_1",
        previewPolicy: "fidelity3",
        verificationPolicy: "strict",
        versionIdForSession: "ver_1",
      }),
    );
    expect(logPreviewLifecycleTelemetryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "preview_start_outcome",
        chatId: "chat_1",
        versionId: "ver_1",
        outcome: "recreated",
        previewPolicy: "fidelity3",
        verificationPolicy: "strict",
      }),
    );
    expect(logPreviewLifecycleTelemetryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "preview_ready",
        chatId: "chat_1",
        versionId: "ver_1",
        sandboxId: "sbx_1",
        sandboxPreviewMode: "dev_only",
        fidelityTier: 2,
        previewPolicy: "fidelity3",
        verificationPolicy: "strict",
        startOutcome: "recreated",
        msSinceEngineStart: expect.any(Number),
      }),
    );
    expect(updateVersionPreviewUrl).toHaveBeenCalledWith("ver_1", "https://preview.example");
  });

  it("F2-mute layer 4: drops detected-integrations SSE in fidelity2 (design)", async () => {
    const helpers = await import("@/lib/gen/stream/shared-own-engine-helpers");
    const mockedDetect = vi.mocked(helpers.getUnsignaledDetectedIntegrations);
    mockedDetect.mockReturnValueOnce([
      {
        key: "stripe",
        name: "Stripe",
        provider: "stripe",
        intent: "env_vars",
        envVars: ["STRIPE_SECRET_KEY"],
        status: "Kräver konfiguration",
      },
    ]);
    const enqueued: string[] = [];
    const safeEnqueue = (data: Uint8Array) => {
      enqueued.push(new TextDecoder().decode(data));
    };

    await runOwnEngineStreamPostFinalize({
      sse: { enc: new TextEncoder(), safeEnqueue },
      chatId: "chat_1",
      finalized: finalized as never,
      accumulatedContent: "import Stripe from 'stripe'",
      toolSignaledProviders: new Set(),
      engineStartedAt: Date.now(),
      commitCredits: async () => {},
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 48_000,
          refsChars: 24_000,
          systemContextChars: 96_000,
        },
      },
    });

    expect(formatSSEEventMock).not.toHaveBeenCalledWith(
      "integration",
      expect.anything(),
    );
    expect(devLogAppend).not.toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({ type: "engine.integration_signals" }),
    );
  });

  it("F2-mute layer 4: emits detected-integrations SSE in fidelity3 (integrations)", async () => {
    const helpers = await import("@/lib/gen/stream/shared-own-engine-helpers");
    const mockedDetect = vi.mocked(helpers.getUnsignaledDetectedIntegrations);
    mockedDetect.mockReturnValueOnce([
      {
        key: "stripe",
        name: "Stripe",
        provider: "stripe",
        intent: "env_vars",
        envVars: ["STRIPE_SECRET_KEY"],
        status: "Kräver konfiguration",
      },
    ]);

    await runOwnEngineStreamPostFinalize({
      sse: { enc: new TextEncoder(), safeEnqueue: () => {} },
      chatId: "chat_1",
      finalized: finalized as never,
      accumulatedContent: "import Stripe from 'stripe'",
      toolSignaledProviders: new Set(),
      engineStartedAt: Date.now(),
      commitCredits: async () => {},
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "release-candidate",
        previewPolicy: "fidelity3",
        verificationPolicy: "strict",
        contextPolicy: "heavy",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 80_000,
          refsChars: 40_000,
          systemContextChars: 160_000,
        },
      },
    });

    expect(formatSSEEventMock).toHaveBeenCalledWith(
      "integration",
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ key: "stripe" })]),
      }),
    );
    expect(devLogAppend).toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({
        type: "engine.integration_signals",
        integrations: ["stripe"],
      }),
    );
  });

  it("emits done with previewPending + previewUrlHint, but no previewUrl", async () => {
    shouldStartOwnEnginePreview.mockReturnValue(true);
    isTier2PreviewConfigured.mockReturnValue(false);
    getPreviewHostBaseUrl.mockReturnValue("https://vm-fly-jakem.fly.dev");

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
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 48_000,
          refsChars: 24_000,
          systemContextChars: 96_000,
        },
      },
    });

    expect(formatSSEEventMock).toHaveBeenCalledWith(
      "done",
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_1",
        previewUrl: null,
        shimPreviewUrl: null,
        previewPending: true,
        previewUrlHint: "https://vm-fly-jakem.fly.dev/chat_1",
      }),
    );
  });

  // plan-02 / STATUS-02: cross-file-import-checker stubs (run-2 in
  // STATUS-01 — coffee-cup-3d.tsx → ./coffee-cup-scene auto-stubbed).
  // Pre-fix the user saw a green "Promoted" badge with no signal that
  // the 3D component was a hollow shell. Now each stub lands as a
  // `warning`-level row in `engine_version_error_logs` under category
  // `merge:cross-file-stub` and surfaces in `VersionDiagnosticsDialog`.
  it("emits warning-level diagnostic row per cross-file-import-checker stub", async () => {
    createEngineVersionErrorLogsMock.mockReset();
    createEngineVersionErrorLogsMock.mockResolvedValue(undefined);
    const finalizedWithStubs = {
      ...finalized,
      crossFileStubs: [
        {
          sourceFile: "components/coffee-cup-3d.tsx",
          missingImport: "./coffee-cup-scene",
          stubFile: "components/coffee-cup-scene.tsx",
        },
        {
          sourceFile: "components/feature-grid.tsx",
          missingImport: "./feature-card",
          stubFile: "components/feature-card.tsx",
        },
      ],
    };

    await runOwnEngineStreamPostFinalize({
      sse: { enc: new TextEncoder(), safeEnqueue: () => {} },
      chatId: "chat_1",
      finalized: finalizedWithStubs as never,
      accumulatedContent: "prefix",
      toolSignaledProviders: new Set(),
      engineStartedAt: Date.now(),
      commitCredits: async () => {},
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "fast",
        contextPolicy: "light",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
      },
      repairPassIndex: 0,
    });

    expect(createEngineVersionErrorLogsMock).toHaveBeenCalledTimes(1);
    const firstCall = createEngineVersionErrorLogsMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const payloads = firstCall![0] as unknown as Array<{
      chatId: string;
      versionId: string;
      level: string;
      category: string;
      message: string;
      meta: Record<string, unknown>;
    }>;
    expect(payloads).toHaveLength(3);
    expect(payloads[0].level).toBe("warning");
    expect(payloads[0].category).toBe("merge:cross-file-stub");
    expect(payloads[0].message).toContain("./coffee-cup-scene");
    expect(payloads[0].message).toContain("components/coffee-cup-3d.tsx");
    expect(payloads[0].meta).toMatchObject({
      sourceFile: "components/coffee-cup-3d.tsx",
      missingImport: "./coffee-cup-scene",
      stubFile: "components/coffee-cup-scene.tsx",
      repairPassIndex: 0,
    });
    expect(payloads[1].meta).toMatchObject({
      sourceFile: "components/feature-grid.tsx",
      missingImport: "./feature-card",
    });
    expect(payloads[2].category).toBe("merge:cross-file-stub-3d-capability");
    expect(payloads[2].message).toContain("3D-fil stubbed utan visual-3d capability");
    expect(payloads[2].meta).toMatchObject({
      sourceFile: "components/coffee-cup-3d.tsx",
      missingImport: "./coffee-cup-scene",
      requestedCapabilities: [],
    });

    // The same stub list is also surfaced on the `done` SSE so the
    // builder-shell can render a "1 fil saknades och stubbades" hint
    // before the diagnostics dialog is opened.
    expect(formatSSEEventMock).toHaveBeenCalledWith(
      "done",
      expect.objectContaining({
        crossFileStubs: expect.arrayContaining([
          expect.objectContaining({ missingImport: "./coffee-cup-scene" }),
        ]),
      }),
    );
  });

  it("skips extra 3d capability warning when visual-3d is already requested", async () => {
    createEngineVersionErrorLogsMock.mockReset();
    createEngineVersionErrorLogsMock.mockResolvedValue(undefined);
    const finalizedWithStubs = {
      ...finalized,
      requestedCapabilities: ["visual-3d"],
      crossFileStubs: [
        {
          sourceFile: "components/coffee-cup-3d.tsx",
          missingImport: "./coffee-cup-scene",
          stubFile: "components/coffee-cup-scene.tsx",
        },
      ],
    };

    await runOwnEngineStreamPostFinalize({
      sse: { enc: new TextEncoder(), safeEnqueue: () => {} },
      chatId: "chat_1",
      finalized: finalizedWithStubs as never,
      accumulatedContent: "prefix",
      toolSignaledProviders: new Set(),
      engineStartedAt: Date.now(),
      commitCredits: async () => {},
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "fast",
        contextPolicy: "light",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
      },
      repairPassIndex: 0,
    });

    expect(createEngineVersionErrorLogsMock).toHaveBeenCalledTimes(1);
    const payloads = createEngineVersionErrorLogsMock.mock.calls[0]?.[0] as Array<{
      category: string;
    }>;
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.category).toBe("merge:cross-file-stub");
  });

  it("emits rewire diagnostics without saying a stub was created", async () => {
    createEngineVersionErrorLogsMock.mockReset();
    createEngineVersionErrorLogsMock.mockResolvedValue(undefined);
    const finalizedWithRewire = {
      ...finalized,
      crossFileStubs: [
        {
          sourceFile: "components/flying-drum-overlay.tsx",
          missingImport: "@/components/three-canvas",
          stubFile: "components/three-canvas-shell",
          rewireTarget: "components/three-canvas-shell",
          rewireImportSpec: "@/components/three-canvas-shell",
        },
      ],
    };

    await runOwnEngineStreamPostFinalize({
      sse: { enc: new TextEncoder(), safeEnqueue: () => {} },
      chatId: "chat_1",
      finalized: finalizedWithRewire as never,
      accumulatedContent: "prefix",
      toolSignaledProviders: new Set(),
      engineStartedAt: Date.now(),
      commitCredits: async () => {},
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "fast",
        contextPolicy: "light",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
      },
      repairPassIndex: 0,
    });

    expect(createEngineVersionErrorLogsMock).toHaveBeenCalledTimes(1);
    const payloads = createEngineVersionErrorLogsMock.mock.calls[0]?.[0] as Array<{
      category: string;
      message: string;
      meta: Record<string, unknown>;
    }>;
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.category).toBe("merge:cross-file-rewire");
    expect(payloads[0]?.message).toContain("pekades om");
    expect(payloads[0]?.message).not.toContain("auto-stubbade");
    expect(payloads[0]?.meta).toMatchObject({
      rewireTarget: "components/three-canvas-shell",
      rewireImportSpec: "@/components/three-canvas-shell",
      stubFile: "components/three-canvas-shell",
    });
  });

  it("does not emit warning rows when there are no cross-file stubs", async () => {
    createEngineVersionErrorLogsMock.mockReset();
    createEngineVersionErrorLogsMock.mockResolvedValue(undefined);

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
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "fast",
        contextPolicy: "light",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
        },
      },
    });

    expect(createEngineVersionErrorLogsMock).not.toHaveBeenCalled();
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
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "fast",
          contextPolicy: "light",
          referenceCategories: [],
          forbiddenPatterns: [],
          tokenBudgets: {
            scaffoldChars: 36_000,
            refsChars: 12_000,
            systemContextChars: 48_000,
          },
        },
        finalized: finalized as never,
      }),
    ).toBe(false);
  });

  it("allows verify when previewPolicy is fidelity3 (F3 lifecycle stage)", () => {
    expect(
      shouldTriggerPostFinalizeServerVerify({
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "release-candidate",
          previewPolicy: "fidelity3",
          verificationPolicy: "strict",
          contextPolicy: "normal",
          referenceCategories: [],
          forbiddenPatterns: [],
          tokenBudgets: {
            scaffoldChars: 48_000,
            refsChars: 24_000,
            systemContextChars: 96_000,
          },
        },
        finalized: finalized as never,
      }),
    ).toBe(true);
  });

  it("allows verify on repair pass even when F2 lifecycle would normally skip", () => {
    expect(
      shouldTriggerPostFinalizeServerVerify({
        buildSpec: {
          buildIntent: "website",
          generationMode: "followUp",
          changeScope: "copy",
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "light",
          referenceCategories: [],
          forbiddenPatterns: [],
          tokenBudgets: {
            scaffoldChars: 36_000,
            refsChars: 12_000,
            systemContextChars: 48_000,
          },
        },
        finalized: finalized as never,
        repairPassIndex: 1,
      }),
    ).toBe(true);
  });

  it("skips verify for clean fidelity2 init even when preview reports non-blocking warnings", () => {
    const finalizedWithWarnings = {
      ...finalized,
      preflight: {
        ...finalized.preflight,
        issueCount: 1,
        errorCount: 0,
        warningCount: 1,
        previewStart: {
          ...finalized.preflight.previewStart,
          issueCounts: {
            ...finalized.preflight.previewStart.issueCounts,
            non_blocking_quality_warning: 2,
          },
        },
      },
    };
    expect(
      resolvePostFinalizeServerVerifyDecision({
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: [],
          forbiddenPatterns: [],
          tokenBudgets: {
            scaffoldChars: 48_000,
            refsChars: 24_000,
            systemContextChars: 96_000,
          },
        },
        finalized: finalizedWithWarnings as never,
      }),
    ).toEqual({
      run: false,
      reason: "design_preview_skip_verify",
    });
  });

  it("still runs verify for clean fidelity3 init flows", () => {
    const finalizedClean = {
      ...finalized,
      preflight: {
        ...finalized.preflight,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
      },
    };
    expect(
      resolvePostFinalizeServerVerifyDecision({
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "release-candidate",
          previewPolicy: "fidelity3",
          verificationPolicy: "strict",
          contextPolicy: "normal",
          referenceCategories: [],
          forbiddenPatterns: [],
          tokenBudgets: {
            scaffoldChars: 48_000,
            refsChars: 24_000,
            systemContextChars: 96_000,
          },
        },
        finalized: finalizedClean as never,
      }),
    ).toEqual({
      run: true,
      reason: "policy_match",
    });
  });

  it("skips low-risk standard website flows when nothing indicates extra verify value", () => {
    expect(
      shouldTriggerPostFinalizeServerVerify({
        buildSpec: {
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: [],
          forbiddenPatterns: [],
          tokenBudgets: {
            scaffoldChars: 48_000,
            refsChars: 24_000,
            systemContextChars: 96_000,
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
          scaffoldId: null,
          routePlanSummary: "prompt:one-page:/",
          stylePack: "brand-led",
          qualityTarget: "standard",
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
          contextPolicy: "normal",
          referenceCategories: [],
          forbiddenPatterns: [],
          tokenBudgets: {
            scaffoldChars: 48_000,
            refsChars: 24_000,
            systemContextChars: 96_000,
          },
        },
        finalized: finalized as never,
      }),
    ).toEqual({
      run: false,
      reason: "design_preview_skip_verify",
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
        scaffoldId: null,
        routePlanSummary: "prompt:one-page:/",
        stylePack: "brand-led",
        qualityTarget: "standard",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        contextPolicy: "normal",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 48_000,
          refsChars: 24_000,
          systemContextChars: 96_000,
        },
      },
    });

    expect(devLogAppend).toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({
        type: "server-verify.policy",
        run: false,
        reason: "design_preview_skip_verify",
        verificationPolicy: "design_preview_skip_verify",
      }),
    );
  });
});
