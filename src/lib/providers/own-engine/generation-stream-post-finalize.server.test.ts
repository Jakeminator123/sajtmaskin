import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { VersionPostchecksInput, VersionVerificationOutcome } from "@/lib/gen/verify/server-verify/verify-run";
import { runOwnEngineStreamPostFinalize } from "./generation-stream-post-finalize";
const run = vi.hoisted(() => vi.fn<(input: VersionPostchecksInput) => Promise<VersionVerificationOutcome>>());
const isServerVerifyEligible = vi.hoisted(() => vi.fn(() => true));
const afterMock = vi.hoisted(() => vi.fn((_pending: Promise<unknown>) => {}));
const devLogAppend = vi.hoisted(() => vi.fn());
const formatSSEEventMock = vi.hoisted(() => vi.fn((event: string, payload: unknown) => JSON.stringify({ event, payload })));
const integrations = vi.hoisted(() => vi.fn(() => [] as Array<{ key: string; envVars: string[] }>));
const logs = vi.hoisted(() => vi.fn(async (_logs: unknown[]) => []));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("@/lib/gen/verify/server-verify", () => ({ runVersionPostchecks: run, isServerVerifyEligible }));
vi.mock("@/lib/db/client", () => ({ dbConfigured: true, db: {} }));
vi.mock("@/lib/db/services/version-errors", () => ({ createEngineVersionErrorLogs: logs }));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend, devLogFinalizeSite: vi.fn() }));
vi.mock("@/lib/logging/event-bus-subscribers", () => ({}));
vi.mock("@/lib/logging/event-bus", () => ({ emit: vi.fn() }));
vi.mock("@/lib/gen/preview/lifecycle-telemetry", () => ({ logPreviewLifecycleTelemetry: vi.fn() }));
vi.mock("@/lib/gen/preview/tier2-config", () => ({ getPreviewHostBaseUrl: () => "https://preview.example/prefix", isTier2PreviewConfigured: () => true }));
vi.mock("@/lib/gen/preview/should-start-preview", () => ({ shouldStartOwnEnginePreview: () => true, hasBuildBreakingVerifierFindings: () => false, isBuildBreakingFinding: () => false }));
vi.mock("@/lib/gen/parser", () => ({ parseCodeProject: () => ({ files: [] }) }));
vi.mock("@/lib/gen/version-manager", () => ({ parseCodeFilesFromFilesJson: () => [{ path: "app/page.tsx", content: "export default()=>null" }] }));
vi.mock("@/lib/gen/stream/shared-own-engine-helpers", () => ({ getUnsignaledDetectedIntegrations: integrations }));
vi.mock("@/lib/streaming", () => ({ formatSSEEvent: formatSSEEventMock }));
vi.mock("@/lib/utils/debug", () => ({ warnLog: vi.fn() }));

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

const billingOrderBuildSpec: BuildSpec = {
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
};

describe("one post-finalize server handoff (legacy dispatchers removed)", () => {
  const deadline = 1_700_000_900_000;
  const base = () => ({
    sse: { enc: new TextEncoder(), safeEnqueue: vi.fn() }, chatId: "chat_1", finalized: finalized as never,
    accumulatedContent: "", toolSignaledProviders: new Set<string>(), engineStartedAt: 1_700_000_000_000,
    requestDeadlineEpochMs: deadline, commitCredits: vi.fn(async () => {}), buildSpec: billingOrderBuildSpec,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    run.mockReset().mockResolvedValue({ kind: "stop", reason: "starting", retryable: true });
    afterMock.mockReset(); integrations.mockReturnValue([]);
  });
  it("billing marker precedes saved-pending done, which precedes ONE servercore using the ORIGINAL request deadline", async () => {
    const params = base(); const order: string[] = [];
    params.commitCredits.mockImplementation(async () => { order.push("billing"); expect(run).not.toHaveBeenCalled(); });
    params.sse.safeEnqueue.mockImplementation(data => { const event = JSON.parse(new TextDecoder().decode(data)); order.push(event.event); });
    run.mockImplementationOnce(async input => {
      order.push("core"); expect(input).toMatchObject({ chatId: "chat_1", versionId: "ver_1", entry: "initial", deadlineEpochMs: deadline });
      return { kind: "stop", reason: "starting", retryable: true };
    });
    await runOwnEngineStreamPostFinalize(params);
    expect(order.indexOf("billing")).toBeLessThan(order.indexOf("done"));
    expect(order.indexOf("done")).toBeLessThan(order.indexOf("core"));
    expect(run).toHaveBeenCalledTimes(1); expect(afterMock).toHaveBeenCalledTimes(1);
    const done = formatSSEEventMock.mock.calls.find(([event]) => event === "done")?.[1];
    expect(done).toMatchObject({ versionId: "ver_1", previewPending: true, previewUrl: null, previewUrlHint: "https://preview.example/prefix/chat_1" });
    expect(formatSSEEventMock.mock.calls.some(([event]) => event === "preview-ready")).toBe(false);
  });
  it("marker failure prevents done, server work and after registration", async () => {
    const params = base(); params.commitCredits.mockRejectedValueOnce(new Error("marker"));
    await expect(runOwnEngineStreamPostFinalize(params)).rejects.toThrow("marker");
    expect(run).not.toHaveBeenCalled(); expect(afterMock).not.toHaveBeenCalled();
    expect(formatSSEEventMock.mock.calls.some(([event]) => event === "done")).toBe(false);
  });
  it("after receives the same tracked completion promise and the SSE tail need not await the job", async () => {
    let settle!: (value: VersionVerificationOutcome) => void;
    run.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
    await runOwnEngineStreamPostFinalize(base());
    const pending = afterMock.mock.calls[0][0]; let completed = false;
    void pending.then(() => { completed = true; });
    await Promise.resolve(); expect(completed).toBe(false);
    settle({ kind: "stop", reason: "starting", retryable: true }); await pending;
    expect(completed).toBe(true);
  });
  it("closed SSE cannot prevent the core or either late notification", async () => {
    const params = base(); params.sse.safeEnqueue.mockImplementation(() => { throw new Error("closed SSE"); });
    await runOwnEngineStreamPostFinalize(params);
    const notify = run.mock.calls[0][0].notifications!;
    expect(() => notify.previewReady?.({ previewUrl: "https://preview.example/c", previewSessionId: "p", lifecycleToken: "t",
      previewMode: "dev_only", fidelityTier: 2, runtimeReady: false, versionId: "ver_1", filesRevision: "r",
      startOutcome: "recreated", bookkeepingRequired: true } as never)).not.toThrow();
    expect(() => notify.repairAvailable?.({ versionId: "ver_1", summary: "repair", repairAvailableAt: null })).not.toThrow();
    expect(run).toHaveBeenCalledTimes(1); expect(afterMock).toHaveBeenCalledTimes(1);
  });
  it("preserves exact preview-ready fields and honest queued-boot runtimeConfirmed:false", async () => {
    await runOwnEngineStreamPostFinalize(base());
    run.mock.calls[0][0].notifications!.previewReady?.({ previewUrl: "https://preview.example/c", previewSessionId: "p",
      lifecycleToken: "t", previewMode: "dev_only", fidelityTier: 2, runtimeReady: false, prodBuildVerified: false,
      prodBuildLogSnippet: "pending", versionId: "ver_1", filesRevision: "r", startOutcome: "recreated", bookkeepingRequired: true } as never);
    expect(formatSSEEventMock).toHaveBeenCalledWith("preview-ready", {
      previewUrl: "https://preview.example/c", previewSessionId: "p", lifecycleToken: "t", previewMode: "dev_only",
      previewTier: 2, runtimeConfirmed: false, prodBuildVerified: false, prodBuildLogSnippet: "pending",
    });
  });
  it("preserves build-error and version-repair-available envelopes, without launching a separate dispatcher", async () => {
    await runOwnEngineStreamPostFinalize(base());
    const notify = run.mock.calls[0][0].notifications!;
    const error = { stage: "preview-start" as const, message: "build failed" };
    const repaired = { versionId: "ver_1", summary: "fix", repairAvailableAt: "2026-10-12T10:00:00Z" };
    notify.buildError?.(error); notify.repairAvailable?.(repaired);
    expect(formatSSEEventMock).toHaveBeenCalledWith("build-error", error);
    expect(formatSSEEventMock).toHaveBeenCalledWith("version-repair-available", repaired);
    expect(run).toHaveBeenCalledTimes(1); expect(afterMock).toHaveBeenCalledTimes(1);
  });
  it("still runs the same job if after is unavailable; never invokes an alternate fallback", async () => {
    afterMock.mockImplementationOnce(() => { throw new Error("outside request"); });
    await runOwnEngineStreamPostFinalize(base());
    expect(run).toHaveBeenCalledTimes(1);
  });
  it.each(["fidelity2", "fidelity3"] as const)("keeps integration SSE policy for %s", async previewPolicy => {
    integrations.mockReturnValue([{ key: "stripe", envVars: ["STRIPE_SECRET_KEY"] }]);
    await runOwnEngineStreamPostFinalize({ ...base(), buildSpec: { ...billingOrderBuildSpec, previewPolicy } });
    expect(formatSSEEventMock.mock.calls.some(([event]) => event === "integration")).toBe(previewPolicy === "fidelity3");
  });
  it("keeps ordinary cross-file diagnostics distinct from server-owned product authority", async () => {
    await runOwnEngineStreamPostFinalize({ ...base(), finalized: { ...finalized, crossFileStubs: [
      { sourceFile: "app/page.tsx", missingImport: "@/components/card", stubFile: "components/card.tsx" },
    ] } as never });
    expect(logs).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({
      chatId: "chat_1", versionId: "ver_1", level: "warning", category: "merge:cross-file-stub",
    })]));
    expect(run).toHaveBeenCalledTimes(1);
  });
});
