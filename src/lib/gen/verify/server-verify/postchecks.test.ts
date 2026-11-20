import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/client", () => ({ dbConfigured: true, db: {}, pool: null }));
vi.mock("@/lib/logging/event-bus-subscribers", () => ({}));
vi.mock("@/lib/logging/event-bus-error-log-sink", () => ({}));
vi.mock("@/lib/logging/event-bus", () => ({ emit: vi.fn() }));
vi.mock("@/lib/db/promote-guard", () => ({ assertPromoteAllowed: vi.fn() }));
import * as repo from "@/lib/db/chat-repository-pg";
import * as promoteGuard from "@/lib/db/promote-guard";
import * as budget from "@/lib/db/services/server-repair-budget";
import * as billing from "@/lib/db/services/generation-billing";
import * as usage from "@/lib/observability/llm-usage";
import * as versions from "@/lib/gen/version-manager";
import * as images from "../version-image-validation";
import * as preview from "@/lib/gen/preview/ensure-version-preview";
import * as sessions from "@/lib/gen/preview/session-store";
import * as telemetry from "@/lib/db/services/generation-telemetry";
import * as tier2 from "@/lib/gen/preview/tier2-config";
import * as product from "../version-product-postcheck";
import * as probes from "../product-postcheck-preview-wait";
import * as claims from "@/lib/db/services/product-postcheck-runs";
import * as gate from "../preview-quality-gate";
import * as exported from "@/lib/gen/export/build-exportable-project";
import * as errors from "@/lib/db/services/version-errors";
import * as f3 from "./f3-readiness";
import * as lease from "./lease";
import * as buildRepair from "./build-error-trigger";
import { runVersionPostchecks, verifyVersionUnderLease } from "./verify-run";
import { DESIGN_PREVIEW_QUALITY_GATE_CHECKS, INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS } from "../quality-gate-checks";

describe("ONE generation/cron postchecks core", () => {
  const NOW = 1_700_000_000_000;
  const deadline = NOW + 900_000;
  const input = { chatId: "c", versionId: "v", entry: "initial" as const, deadlineEpochMs: deadline };
  const files = [{ path: "app/page.tsx", content: "export default function Page(){return null}", language: "tsx" as const }];
  let target: repo.ServerPostcheckTarget;
  let policy: budget.ServerRepairBudgetSnapshot["startPolicy"];
  let revision: string;
  let order: string[];
  const snapshot = () => ({ files, filesJson: JSON.stringify(files), filesRevision: revision,
    lifecycleStage: target.version.lifecycle_stage, editKind: target.version.edit_kind,
    releaseState: "draft", verificationState: target.version.verification_state, verificationSummary: null, parentVersionId: null });
  const productResult = () => ({ kind: "result" as const, result: { ok: true as const, skipped: false, skippedReason: null, warnings: [], warningCount: 0,
    productBlocked: false, routesChecked: 1, durationMs: 1, checkedUrl: "https://preview.example/c",
    attestation: { previewSessionId: "session", lifecycleToken: "token", filesRevision: revision },
    storageReceipt: { status: "stored" as const, versionId: "v", filesRevision: revision } } });
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW); order = []; revision = "r1";
    target = { chat: { id: "c", project_id: "p" }, userId: "u", sessionId: "s", hasBilling: true, imported: false, latest: true,
      version: { id: "v", chat_id: "c", files_revision: revision, files_json: JSON.stringify(files), lifecycle_stage: "design",
        edit_kind: null, release_state: "draft", verification_state: "pending", verification_summary: null,
        selected_dossier_env_keys: null, preview_url: null, created_at: new Date(NOW - 600_000).toISOString() } as never };
    policy = { previewPolicy: "fidelity2", verificationPolicy: "standard", serverVerify: { run: false, reason: "design_preview_skip_verify" },
      preview: { canStartPreview: true, hasBuildBreakingFindings: false },
      postChecks: { materializeImages: true, willRunQualityGate: false, qualityGatePlanned: false } };
    vi.spyOn(repo, "getServerPostcheckTarget").mockImplementation(async () => ({ ...target, version: { ...target.version, files_revision: revision } }));
    vi.spyOn(versions, "getVersionFilesSnapshot").mockImplementation(async () => { order.push("readback"); return snapshot() as never; });
    vi.spyOn(lease, "acquireVerifyLease").mockResolvedValue({ proceed: true, runId: "holder" });
    vi.spyOn(lease, "releaseVerifyLease").mockResolvedValue(undefined);
    vi.spyOn(lease, "isLatestVersionForChat").mockResolvedValue(true);
    vi.spyOn(repo, "renewVersionLease").mockResolvedValue(true);
    vi.spyOn(repo, "markVersionVerifying").mockResolvedValue(null as never);
    vi.spyOn(repo, "resetVersionVerificationToPending").mockImplementation(async () => { target.version.verification_state = "pending"; return target.version; });
    vi.spyOn(repo, "failVersionVerification").mockResolvedValue(null as never);
    vi.spyOn(repo, "promoteVersion").mockResolvedValue(null as never);
    vi.spyOn(budget, "readServerRepairBudget").mockImplementation(async () => ({ status: "ready", snapshot: {
      scopeId: "original", filesRevision: "r1", startPolicy: policy, finalize: [], consumed: [] } }));
    vi.spyOn(budget, "readServerResumeControl").mockResolvedValue({ status: "resume_control", snapshot: { disposition: "eligible" } } as never);
    vi.spyOn(budget, "reserveServerResumeAttempt").mockImplementation(async () => { order.push("reserve"); return { status: "resume_reserved", attemptId: 1 } as never; });
    vi.spyOn(budget, "settleServerResumeAttempt").mockResolvedValue({ status: "resume_settled" } as never);
    vi.spyOn(budget, "recordServerResumeHold").mockResolvedValue({ status: "resume_held" } as never);
    vi.spyOn(budget, "completeServerPostchecks").mockResolvedValue({ status: "resume_settled" } as never);
    vi.spyOn(images, "prepareVersionImages").mockImplementation(async () => { order.push("images"); revision = "r2";
      return { kind: "prepared", persisted: true, filesRevision: revision, materialization: null, warnings: [] }; });
    vi.spyOn(preview, "ensureVersionPreview").mockImplementation(async () => { order.push("preview"); return { ok: true, result: {
      versionId: "v", previewSessionId: "session", lifecycleToken: "token", previewUrl: "https://preview.example/c",
      filesRevision: revision, runtimeReady: true, previewMode: "dev_only", fidelityTier: 2,
      startOutcome: "resumed", bookkeepingRequired: true, previewDeadlineEpochMs: deadline } }; });
    vi.spyOn(preview, "persistVersionPreviewOutcome").mockImplementation(async () => { order.push("persist"); return true; });
    vi.spyOn(sessions, "getActivePreviewSessionAsync").mockImplementation(async () => ({ versionId: "v", filesRevision: revision,
      previewSessionId: "session", lifecycleToken: "token", mutationRevision: 1 } as never));
    vi.spyOn(telemetry, "recordPreviewRuntimeOutcomeForVersion").mockResolvedValue(undefined);
    vi.spyOn(product, "runHeldVersionProductPostcheck").mockImplementation(async () => { order.push("product"); return productResult(); });
    vi.spyOn(product, "runVersionProductPostcheck").mockImplementation(async () => { order.push("replay"); return productResult(); });
    vi.spyOn(probes, "readProductPostcheckPreviewProbe").mockImplementation(async () => { order.push("probe"); return {
      running: true, versionId: "v", filesRevision: revision, previewSessionId: "session", lifecycleToken: "token", mutationRevision: 1,
      readinessState: "ready", httpReady: true, previewUrl: "https://preview.example/c" }; });
    vi.spyOn(claims, "lookupProductPostcheckRun").mockResolvedValue({ kind: "available" } as never);
    vi.spyOn(gate, "isQualityGateDisabledByEnv").mockReturnValue(false);
    vi.spyOn(gate, "isQualityGateConfigured").mockReturnValue(true);
    vi.spyOn(tier2, "isTier2PreviewConfigured").mockReturnValue(true);
    vi.spyOn(gate, "runQualityGateOnExportable").mockImplementation(async () => { order.push("gate"); return null; });
    vi.spyOn(exported, "chatUsesVerbatimRepo").mockResolvedValue(false);
    vi.spyOn(exported, "buildExportableProject").mockResolvedValue(files);
    vi.spyOn(errors, "createEngineVersionErrorLogs").mockResolvedValue([] as never);
    vi.spyOn(errors, "reopenFailedProductPostcheckRun").mockImplementation(async () => { order.push("reopen"); return true; });
    vi.spyOn(f3, "loadServerVerifyF3ReadinessContext").mockResolvedValue({ projectId: "p", orchestrationSnapshot: null } as never);
    vi.spyOn(f3, "evaluateServerOwnedF3Readiness").mockResolvedValue({ ready: true, ok: true } as never);
    vi.spyOn(f3, "persistF3ReadinessHold").mockResolvedValue(undefined);
    vi.spyOn(usage, "flushPendingUsageWrites").mockResolvedValue(undefined);
    vi.spyOn(billing, "settleExistingGenerationBillingIfPresent").mockResolvedValue(null);
    vi.spyOn(buildRepair, "repairBuildErrorUnderLease").mockResolvedValue({ started: true, repairAvailable: true,
      verification: { kind: "stop", reason: "repair_settled", retryable: false } });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); lease.inflight.clear(); });

  it.each(["null", "error"])("does not claim superseded when the guarded write returns %s", async failure => {
    vi.mocked(lease.isLatestVersionForChat).mockResolvedValue(false);
    const write = vi.spyOn(repo, "markVersionSupersededByRepair");
    if (failure === "error") write.mockRejectedValue(new Error("database unavailable"));
    else write.mockResolvedValue(null);
    const outcome = await verifyVersionUnderLease({ chatId: "c", versionId: "v", holderRunId: "holder", snapshot: snapshot() as never });
    expect(outcome).toEqual({ kind: "stop", reason: "supersede_persist_failed", retryable: true });
    expect(errors.createEngineVersionErrorLogs).not.toHaveBeenCalled();
    expect(gate.runQualityGateOnExportable).not.toHaveBeenCalled();
  });

  it("reports superseded only after the guarded write succeeds", async () => {
    vi.mocked(lease.isLatestVersionForChat).mockResolvedValue(false);
    vi.spyOn(repo, "markVersionSupersededByRepair").mockResolvedValue({ ...target.version, verification_state: "superseded" });
    expect(await verifyVersionUnderLease({ chatId: "c", versionId: "v", holderRunId: "holder", snapshot: snapshot() as never }))
      .toMatchObject({ kind: "superseded", cause: "newer_version" });
  });

  it("settles a resume as retryable failure when the supersede write is unconfirmed", async () => {
    policy.serverVerify = { run: true, reason: "verify" };
    vi.mocked(lease.isLatestVersionForChat).mockResolvedValue(false);
    vi.spyOn(repo, "markVersionSupersededByRepair").mockResolvedValue(null);
    expect(await runVersionPostchecks({ ...input, entry: "resume" }))
      .toEqual({ kind: "stop", reason: "supersede_persist_failed", retryable: true });
    expect(budget.settleServerResumeAttempt).toHaveBeenCalledWith(expect.anything(), 1, "retryable_failure");
    expect(budget.settleServerResumeAttempt).not.toHaveBeenCalledWith(expect.anything(), 1, "superseded");
  });

  it("orders held images → RAW readback revision → preview → AWAIT persist → product, with no initial resume attempt", async () => {
    expect(await runVersionPostchecks(input)).toMatchObject({ kind: "continue", filesRevision: "r2", promoted: false });
    expect(order.filter(step => !["readback", "probe"].includes(step))).toEqual(["images", "preview", "persist", "product"]);
    expect(order.indexOf("images")).toBeLessThan(order.lastIndexOf("readback"));
    expect(preview.ensureVersionPreview).toHaveBeenCalledWith(expect.objectContaining({ holderRunId: "holder", expectedFilesRevision: "r2", previewDeadlineEpochMs: deadline }));
    expect(product.runHeldVersionProductPostcheck).toHaveBeenCalledWith(expect.objectContaining({ deadlineAt: deadline,
      held: { chatId: "c", versionId: "v", holderRunId: "holder", filesRevision: "r2" },
      expectedPreview: { previewSessionId: "session", lifecycleToken: "token", filesRevision: "r2", mutationRevision: 1 } }));
    expect(budget.reserveServerResumeAttempt).not.toHaveBeenCalled();
    expect(budget.completeServerPostchecks).toHaveBeenCalledWith({ chatId: "c", versionId: "v", runId: "holder", filesRevision: "r2" });
    expect(lease.releaseVerifyLease).toHaveBeenCalledWith("v", "holder");
  });
  it("does not proceed to product while preview persistence is pending or failed", async () => {
    let release!: (value: boolean) => void;
    vi.mocked(preview.persistVersionPreviewOutcome).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = runVersionPostchecks(input);
    await vi.waitFor(() => expect(preview.persistVersionPreviewOutcome).toHaveBeenCalled());
    expect(product.runHeldVersionProductPostcheck).not.toHaveBeenCalled();
    release(false); expect(await pending).toMatchObject({ kind: "stop", reason: "preview_persist_failed" });
    expect(product.runHeldVersionProductPostcheck).not.toHaveBeenCalled(); expect(gate.runQualityGateOnExportable).not.toHaveBeenCalled();
  });
  it("a closed notification/SSE observer does not stop the chain", async () => {
    expect((await runVersionPostchecks({ ...input, notifications: { previewReady: () => { throw new Error("closed"); } } })).kind).toBe("continue");
    expect(product.runHeldVersionProductPostcheck).toHaveBeenCalledTimes(1); expect(lease.releaseVerifyLease).toHaveBeenCalledTimes(1);
  });

  it("actual readiness wait progresses starting → ready without a client; only the EXACT revision/lifecycle gets a late true stamp", async () => {
    vi.useFakeTimers();
    vi.mocked(preview.ensureVersionPreview).mockImplementationOnce(async () => ({ ok: true, result: {
      versionId: "v", previewSessionId: "session", lifecycleToken: "token", previewUrl: "https://preview.example/c",
      filesRevision: revision, runtimeReady: false, previewMode: "dev_only", fidelityTier: 2,
      startOutcome: "recreated", bookkeepingRequired: true, previewDeadlineEpochMs: deadline } }));
    vi.mocked(probes.readProductPostcheckPreviewProbe).mockResolvedValueOnce({ running: false, versionId: "v", filesRevision: "r2",
      previewSessionId: "session", lifecycleToken: "token", mutationRevision: 1, readinessState: "starting", httpReady: false } as never);
    const pending = runVersionPostchecks(input);
    await vi.advanceTimersByTimeAsync(0);
    expect(telemetry.recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
    expect(product.runHeldVersionProductPostcheck).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8_000);
    expect((await pending).kind).toBe("continue");
    expect(telemetry.recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledExactlyOnceWith("v", true, { bootedFilesRevision: "r2" });
    expect(product.runHeldVersionProductPostcheck).toHaveBeenCalledWith(expect.objectContaining({
      expectedPreview: { previewSessionId: "session", lifecycleToken: "token", mutationRevision: 1, filesRevision: "r2" } }));
    expect(lease.releaseVerifyLease).toHaveBeenCalledWith("v", "holder");
  });
  it.each(["lifecycle", "version", "database_revision"])("a late ready observation with changed %s is NOT stamped or product/gate-accepted", async changed => {
    vi.mocked(preview.ensureVersionPreview).mockImplementation(async () => ({ ok: true, result: {
      versionId: "v", previewSessionId: "session", lifecycleToken: "token", previewUrl: "https://preview.example/c",
      filesRevision: revision, runtimeReady: false, previewMode: "dev_only", fidelityTier: 2,
      startOutcome: "recreated", bookkeepingRequired: true, previewDeadlineEpochMs: deadline } }));
    vi.mocked(probes.readProductPostcheckPreviewProbe).mockImplementation(async () => {
      if (changed === "database_revision") revision = "external-revision";
      return { running: true, versionId: changed === "version" ? "other" : "v", filesRevision: "r2",
        previewSessionId: "session", lifecycleToken: changed === "lifecycle" ? "other" : "token", mutationRevision: 1,
        readinessState: "ready", httpReady: true, previewUrl: "https://preview.example/c" };
    });
    expect((await runVersionPostchecks(input)).kind).not.toBe("continue");
    expect(telemetry.recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
    expect(product.runHeldVersionProductPostcheck).not.toHaveBeenCalled(); expect(gate.runQualityGateOnExportable).not.toHaveBeenCalled();
  });
  it("queued runtime is left PENDING with no stamp, not false or true, until actual readiness proof", async () => {
    vi.useFakeTimers();
    vi.mocked(preview.ensureVersionPreview).mockImplementationOnce(async () => ({ ok: true, result: {
      versionId: "v", previewSessionId: "session", lifecycleToken: "token", previewUrl: "https://preview.example/c",
      filesRevision: revision, runtimeReady: false, previewMode: "dev_only", fidelityTier: 2,
      startOutcome: "recreated", bookkeepingRequired: true, previewDeadlineEpochMs: deadline } }));
    // Contradictory process-live/starting is not confirmed HTTP readiness.
    let probesRead = 0;
    vi.mocked(probes.readProductPostcheckPreviewProbe).mockImplementation(async () => {
      if (++probesRead > 1) vi.setSystemTime(NOW + probes.PRODUCT_POSTCHECK_PREVIEW_WAIT_MS);
      return { running: true, versionId: "v", filesRevision: "r2", previewSessionId: "session", lifecycleToken: "token",
        mutationRevision: 1, readinessState: "starting", httpReady: false } as never;
    });
    const pending = runVersionPostchecks(input);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await pending).toMatchObject({ kind: "stop", reason: "starting", retryable: true });
    expect(telemetry.recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
    expect(product.runHeldVersionProductPostcheck).not.toHaveBeenCalled();

    // A later scheduler tick must continue the original version after boot,
    // even though the initial request has already stopped waiting.
    vi.mocked(probes.readProductPostcheckPreviewProbe).mockImplementation(async () => ({
      running: true, versionId: "v", filesRevision: revision, previewSessionId: "session", lifecycleToken: "token",
      mutationRevision: 1, readinessState: "ready", httpReady: true, previewUrl: "https://preview.example/c",
    }));
    expect(await runVersionPostchecks({ ...input, entry: "resume" })).toMatchObject({ kind: "continue", filesRevision: "r2" });
    expect(product.runHeldVersionProductPostcheck).toHaveBeenCalledTimes(1);
    expect(budget.settleServerResumeAttempt).toHaveBeenCalledWith(expect.anything(), 1, "completed");
  });
  it.each(["missing_owner", "missing_billing", "missing_init", "quick_edit", "restore", "not_latest"])("stops before actual work for %s", async kind => {
    if (kind === "missing_owner") vi.mocked(repo.getServerPostcheckTarget).mockResolvedValue(null);
    if (kind === "missing_billing") target.hasBilling = false;
    if (kind === "missing_init") vi.mocked(budget.readServerRepairBudget).mockResolvedValue({ status: "history_unknown" });
    if (kind === "quick_edit" || kind === "restore") target.version.edit_kind = kind;
    if (kind === "not_latest") target.latest = false;
    expect((await runVersionPostchecks(input)).kind).toBe("stop");
    expect(images.prepareVersionImages).not.toHaveBeenCalled(); expect(preview.ensureVersionPreview).not.toHaveBeenCalled();
    expect(budget.reserveServerResumeAttempt).not.toHaveBeenCalled(); expect(gate.runQualityGateOnExportable).not.toHaveBeenCalled();
  });
  it("applies a saved preview block only while the receipt revision is current", async () => {
    policy.preview.hasBuildBreakingFindings = true;
    expect(await runVersionPostchecks(input)).toMatchObject({ kind: "stop", reason: "preview_blocked", retryable: false });
    expect(images.prepareVersionImages).not.toHaveBeenCalled();
    vi.mocked(budget.readServerRepairBudget).mockImplementation(async () => ({ status: "ready", snapshot: {
      scopeId: "original", filesRevision: "stale-finalize", startPolicy: policy, finalize: [], consumed: [
        { passIndex: 0, slot: "primary", contentHash: "a".repeat(16), diagnosticFingerprint: "b".repeat(16), requiredFiles: ["app/page.tsx"], outcome: "success" },
      ] } }));
    expect((await runVersionPostchecks(input)).kind).toBe("continue");
    expect(images.prepareVersionImages).toHaveBeenCalled();
  });
  it("missing repair history stops without becoming terminal", async () => {
    vi.mocked(budget.readServerRepairBudget).mockResolvedValue({ status: "history_unknown" });
    expect(await runVersionPostchecks(input)).toMatchObject({ kind: "stop", reason: "history_unknown", retryable: true });
    expect(images.prepareVersionImages).not.toHaveBeenCalled();
  });
  it("preserves the old unconfigured-preview guard before any lease, image/Blob or model work", async () => {
    vi.mocked(tier2.isTier2PreviewConfigured).mockReturnValue(false);
    expect(await runVersionPostchecks(input)).toMatchObject({ kind: "stop", reason: "preview_unconfigured", retryable: true });
    expect(lease.acquireVerifyLease).not.toHaveBeenCalled(); expect(images.prepareVersionImages).not.toHaveBeenCalled();
    expect(buildRepair.repairBuildErrorUnderLease).not.toHaveBeenCalled();
  });
  it.each(["verifying", "repairing"] as const)("expired-holder %s is CAS-reset/read back before r-reservation, with no history/payload reset", async verificationState => {
    target.version.verification_state = verificationState;
    expect((await runVersionPostchecks({ ...input, entry: "resume" })).kind).toBe("continue");
    expect(repo.resetVersionVerificationToPending).toHaveBeenCalledWith("v", expect.any(String), "holder", {
      expected: { filesJson: JSON.stringify(files), filesRevision: "r1", editKind: null, verificationState,
        releaseState: "draft", verificationSummary: null }, preserveRepairPayload: true });
    expect(vi.mocked(repo.resetVersionVerificationToPending).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(budget.reserveServerResumeAttempt).mock.invocationCallOrder[0]);
    expect(budget.settleServerResumeAttempt).toHaveBeenCalledWith(expect.anything(), 1, "completed");
  });
  it.each(["candidate", "cas_miss"])("takeover %s never clears user repair data or authorizes work on an unconfirmed reset", async kind => {
    target.version.verification_state = "repairing";
    if (kind === "candidate") target.version.repaired_files_json = "saved candidate";
    else vi.mocked(repo.resetVersionVerificationToPending).mockResolvedValueOnce(null);
    expect((await runVersionPostchecks({ ...input, entry: "resume" })).kind).toBe("stop");
    expect(budget.reserveServerResumeAttempt).not.toHaveBeenCalled(); expect(images.prepareVersionImages).not.toHaveBeenCalled();
    if (kind === "candidate") expect(repo.resetVersionVerificationToPending).not.toHaveBeenCalled();
  });
  it("diagnosticOnly with no verify intent never falls back to a promotive quality gate", async () => {
    policy.serverVerify.diagnosticOnly = true; policy.postChecks.willRunQualityGate = true;
    expect(await runVersionPostchecks(input)).toMatchObject({ kind: "stop", reason: "diagnostic_only_policy", retryable: false });
    expect(gate.runQualityGateOnExportable).not.toHaveBeenCalled(); expect(repo.promoteVersion).not.toHaveBeenCalled();
  });
  it("unknown runtime IO is NOT a confirmed refundable hold; the reserved logical attempt remains consumed", async () => {
    vi.useFakeTimers(); let reads = 0;
    vi.mocked(probes.readProductPostcheckPreviewProbe).mockImplementation(async () => {
      if (++reads === 1) return { running: true, versionId: "v", filesRevision: revision, previewSessionId: "session",
        lifecycleToken: "token", mutationRevision: 1, readinessState: "ready", httpReady: true } as never;
      if (reads > 2) vi.setSystemTime(NOW + probes.PRODUCT_POSTCHECK_PREVIEW_WAIT_MS);
      return { running: false, versionId: "v", filesRevision: revision, previewSessionId: "session", lifecycleToken: "token",
        mutationRevision: 1, readinessState: null, httpReady: null } as never;
    });
    const pending = runVersionPostchecks({ ...input, entry: "resume" });
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await pending).toMatchObject({ kind: "stop", reason: "runtime_unconfirmed", retryable: true });
    expect(budget.settleServerResumeAttempt).toHaveBeenCalledWith(expect.objectContaining({ runId: "holder" }), 1, "retryable_failure");
    expect(budget.recordServerResumeHold).not.toHaveBeenCalled(); expect(product.runHeldVersionProductPostcheck).not.toHaveBeenCalled();
  });
  it("uses stored guest/session attribution with an existing marker, without requiring a signed-in owner", async () => {
    target.userId = "guest:s";
    vi.mocked(product.runHeldVersionProductPostcheck).mockImplementationOnce(async () => {
      expect(usage.getLlmUsageContext()).toMatchObject({ userId: "guest:s", sessionId: "s", chatId: "c", versionId: "v", runId: "holder" });
      return productResult();
    });
    expect((await runVersionPostchecks(input)).kind).toBe("continue");
    expect(billing.settleExistingGenerationBillingIfPresent).toHaveBeenCalledWith({ chatId: "c", versionId: "v", userId: "guest:s" });
  });
  it("a failed pending product claim is retried only after a bounded resume reservation", async () => {
    vi.mocked(claims.lookupProductPostcheckRun).mockResolvedValue({ kind: "settled", status: "failed", runId: "claim", claimGeneration: 4 });
    vi.mocked(product.runVersionProductPostcheck).mockResolvedValue({ kind: "result", result: {
      ...productResult().result, skipped: true, skippedReason: "claim_settled", attestation: null,
    } } as never);
    expect(await runVersionPostchecks({ ...input, entry: "resume" })).toMatchObject({ kind: "continue" });
    expect(order.indexOf("reserve")).toBeLessThan(order.indexOf("reopen"));
    expect(order.indexOf("reopen")).toBeLessThan(order.indexOf("product"));
    expect(errors.reopenFailedProductPostcheckRun).toHaveBeenCalledWith(expect.objectContaining({
      held: { chatId: "c", versionId: "v", filesRevision: "r1", holderRunId: "holder" },
      claim: { runId: "claim", claimGeneration: 4 }, deadlineAt: deadline,
    }));
    expect(budget.settleServerResumeAttempt).toHaveBeenCalledWith(expect.anything(), 1, "completed");
  });
  it.each(["capacity", "cas", "write_error"])("failed product retry stops safely on %s", async failure => {
    vi.mocked(claims.lookupProductPostcheckRun).mockResolvedValue({ kind: "settled", status: "failed", runId: "claim", claimGeneration: 4 });
    vi.mocked(product.runVersionProductPostcheck).mockResolvedValue({ kind: "result", result: {
      ...productResult().result, skipped: true, skippedReason: "claim_settled", attestation: null,
    } } as never);
    if (failure === "capacity") vi.mocked(budget.reserveServerResumeAttempt).mockResolvedValue({ status: "terminal" });
    if (failure === "cas") vi.mocked(errors.reopenFailedProductPostcheckRun).mockResolvedValue(false);
    if (failure === "write_error") vi.mocked(errors.reopenFailedProductPostcheckRun).mockRejectedValue(new Error("offline"));
    expect((await runVersionPostchecks({ ...input, entry: "resume" })).kind).toBe("stop");
    expect(product.runHeldVersionProductPostcheck).not.toHaveBeenCalled();
    if (failure === "capacity") expect(errors.reopenFailedProductPostcheckRun).not.toHaveBeenCalled();
    else expect(budget.settleServerResumeAttempt).toHaveBeenCalledWith(expect.anything(), 1, "retryable_failure");
  });
  it("resume probes and pure claim replay PRECEDE one reservation; duplicates take no second lease/work", async () => {
    vi.mocked(claims.lookupProductPostcheckRun).mockResolvedValue({ kind: "settled", status: "passed", runId: "claim" } as never);
    const resumed = { ...input, entry: "resume" as const };
    let release!: (value: boolean) => void;
    vi.mocked(preview.persistVersionPreviewOutcome).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = runVersionPostchecks(resumed);
    await vi.waitFor(() => expect(preview.persistVersionPreviewOutcome).toHaveBeenCalled());
    expect(await runVersionPostchecks(resumed)).toMatchObject({ kind: "stop", reason: "lease_busy" });
    release(true); await first;
    expect(order.indexOf("probe")).toBeLessThan(order.indexOf("reserve"));
    expect(order.indexOf("replay")).toBeLessThan(order.indexOf("reserve"));
    expect(order.indexOf("reserve")).toBeLessThan(order.indexOf("images"));
    expect(budget.reserveServerResumeAttempt).toHaveBeenCalledTimes(1);
    expect(budget.settleServerResumeAttempt).toHaveBeenCalledWith(expect.objectContaining({ filesRevision: "r2" }), 1, "completed");
    expect(lease.acquireVerifyLease).toHaveBeenCalledTimes(1);
  });
  it.each(["starting", "runtime_hold", "claim_busy"])("confirmed %s holds reserve neither resume work nor model capacity", async reason => {
    if (reason === "claim_busy") vi.mocked(claims.lookupProductPostcheckRun).mockResolvedValue({ kind: "busy", runId: "other" } as never);
    else vi.mocked(probes.readProductPostcheckPreviewProbe).mockResolvedValue({ running: false, versionId: "v", filesRevision: "r1",
      readinessState: reason === "starting" ? "starting" : "failed" } as never);
    expect(await runVersionPostchecks({ ...input, entry: "resume" })).toMatchObject({ kind: "stop", reason, retryable: true });
    expect(budget.recordServerResumeHold).toHaveBeenCalledWith(expect.objectContaining({ runId: "holder", filesRevision: "r1" }), reason);
    expect(budget.reserveServerResumeAttempt).not.toHaveBeenCalled(); expect(images.prepareVersionImages).not.toHaveBeenCalled();
  });
  it("import control is non-paid/non-mutating, disables LR and preserves literal project files", async () => {
    target.imported = true; target.hasBilling = false; target.version.edit_kind = "imported_repo";
    vi.mocked(budget.readServerRepairBudget).mockResolvedValue({ status: "history_unknown" });
    await runVersionPostchecks({ ...input, entry: "resume" });
    expect(images.prepareVersionImages).not.toHaveBeenCalled(); expect(buildRepair.repairBuildErrorUnderLease).not.toHaveBeenCalled();
    expect(product.runHeldVersionProductPostcheck).toHaveBeenCalledWith(expect.objectContaining({ liveReviewPolicy: "disabled", held: expect.objectContaining({ filesRevision: "r1" }) }));
    expect(billing.settleExistingGenerationBillingIfPresent).not.toHaveBeenCalled();
    expect(preview.ensureVersionPreview).toHaveBeenCalledWith(expect.objectContaining({ version: expect.objectContaining({ files_json: JSON.stringify(files) }) }));
  });
  it.each(["f2_qg", "f3_verify", "diagnostic_only"])("selects exactly ONE held gate for %s, never a promotive diagnostic fallback", async lane => {
    policy.postChecks.willRunQualityGate = true; policy.postChecks.qualityGatePlanned = true;
    if (lane === "f3_verify") { target.version.lifecycle_stage = "integrations"; policy.previewPolicy = "fidelity3"; policy.serverVerify.run = true; }
    if (lane === "diagnostic_only") { policy.serverVerify.run = true; policy.serverVerify.diagnosticOnly = true; }
    await runVersionPostchecks(input);
    expect(gate.runQualityGateOnExportable).toHaveBeenCalledTimes(1);
    expect(gate.runQualityGateOnExportable).toHaveBeenCalledWith(expect.objectContaining({ verifyDeadlineEpochMs: deadline,
      checks: lane === "f3_verify" ? INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS : DESIGN_PREVIEW_QUALITY_GATE_CHECKS }));
    expect(repo.promoteVersion).not.toHaveBeenCalled(); expect(buildRepair.repairBuildErrorUnderLease).not.toHaveBeenCalled();
  });
  it("QG branch: the chain outcome is the gate's stop decision plus the gate response the cron route serializes", async () => {
    policy.postChecks.willRunQualityGate = true;
    // Byte-level lock: GET /api/engine/postchecks returns this object as `results[].outcome`.
    expect(JSON.stringify(await runVersionPostchecks(input))).toBe(JSON.stringify({
      body: { error: "Quality gate not configured (missing preview-host verify lane).", code: "quality_gate_disabled",
        hint: gate.QUALITY_GATE_SETUP_HINT },
      status: 501, kind: "stop", reason: "quality_gate_disabled", retryable: false, vmGatePassed: false, promoted: false }));
    expect(budget.completeServerPostchecks).not.toHaveBeenCalled();
  });
  it("QG branch: a promoted gate continues the chain on the gated revision and completes the initial postchecks", async () => {
    policy.postChecks.qualityGatePlanned = true;
    const check = { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 1 };
    vi.mocked(gate.runQualityGateOnExportable).mockResolvedValue({ results: [check], verifyLaneDurationMs: 1,
      firstFailureCheck: null, jobStartedAt: null, jobFinishedAt: null });
    vi.mocked(promoteGuard.assertPromoteAllowed).mockResolvedValue({ allowed: true });
    vi.mocked(repo.promoteVersion).mockResolvedValue(target.version);
    expect(JSON.stringify(await runVersionPostchecks(input))).toBe(JSON.stringify({
      body: { passed: true, checks: [check], verifyLaneDurationMs: 1, firstFailureCheck: null, jobStartedAt: null,
        jobFinishedAt: null, promoted: true },
      status: 200, kind: "continue", filesRevision: "r2", vmGatePassed: true, promoted: true, advisory: false }));
    expect(repo.promoteVersion).toHaveBeenCalledWith("v", "Automatic verification passed.", "holder");
    expect(budget.completeServerPostchecks).toHaveBeenCalledTimes(1);
  });
  it.each(["image", "preview", "persist", "product", "renew"])("original deadline exhausted during %s stops before another phase/model/gate", async phase => {
    const expire = () => vi.mocked(Date.now).mockReturnValue(deadline);
    if (phase === "image") vi.mocked(images.prepareVersionImages).mockImplementationOnce(async () => { expire(); return { kind: "stopped", persisted: false } as never; });
    if (phase === "preview") vi.mocked(preview.ensureVersionPreview).mockImplementationOnce(async () => { expire(); return { ok: false, reason: "version_changed" }; });
    if (phase === "persist") vi.mocked(preview.persistVersionPreviewOutcome).mockImplementationOnce(async () => { expire(); return true; });
    if (phase === "product") vi.mocked(product.runHeldVersionProductPostcheck).mockImplementationOnce(async () => { expire(); return productResult(); });
    if (phase === "renew") vi.mocked(repo.renewVersionLease).mockImplementationOnce(async () => { expire(); return true; });
    expect((await runVersionPostchecks(input)).kind).toBe("stop"); expect(gate.runQualityGateOnExportable).not.toHaveBeenCalled();
    expect(buildRepair.repairBuildErrorUnderLease).not.toHaveBeenCalled();
    expect(lease.releaseVerifyLease).toHaveBeenCalledTimes(1);
  });
  it("supersession restarts at most ONCE, retaining the original deadline and holder", async () => {
    vi.mocked(product.runHeldVersionProductPostcheck).mockImplementation(async () => ({ kind: "result", result: { ...productResult().result,
      skipped: true, skippedReason: "preview_superseded", attestation: null } }));
    expect((await runVersionPostchecks({ ...input, entry: "resume" })).kind).toBe("superseded");
    expect(product.runHeldVersionProductPostcheck).toHaveBeenCalledTimes(2);
    expect(budget.reserveServerResumeAttempt).toHaveBeenCalledTimes(1);
    expect(budget.settleServerResumeAttempt).toHaveBeenCalledWith(expect.objectContaining({ runId: "holder" }), 1, "superseded");
    for (const [call] of vi.mocked(product.runHeldVersionProductPostcheck).mock.calls) expect(call.deadlineAt).toBe(deadline);
  });
  it("preview build repair stays under the SAME holder/deadline and typed STOP does not run product or another gate", async () => {
    vi.mocked(preview.ensureVersionPreview).mockResolvedValue({ ok: false, reason: "start_failed", error: { stage: "preview-start", message: "compile failed" } });
    expect(await runVersionPostchecks(input)).toMatchObject({ kind: "stop", reason: "repair_settled" });
    expect(buildRepair.repairBuildErrorUnderLease).toHaveBeenCalledWith(expect.objectContaining({ holderRunId: "holder", repairDeadlineEpochMs: deadline }));
    expect(telemetry.recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v", false, { bootedFilesRevision: "r2" });
    expect(product.runHeldVersionProductPostcheck).not.toHaveBeenCalled(); expect(gate.runQualityGateOnExportable).not.toHaveBeenCalled();
  });
  const failedProbe = (readinessError: string | null, running = true) => ({ running, versionId: "v", filesRevision: revision,
    previewSessionId: "session", lifecycleToken: "token", mutationRevision: 1, previewUrl: "https://preview.example/c",
    readinessState: "failed" as const, httpReady: false, readinessError });
  const OVERLAY = "Next dev served its build error overlay: Module not found: Can't resolve './missing'";
  it("a boot that is accepted and THEN fails to compile reaches the same held repair as a start failure", async () => {
    vi.mocked(probes.readProductPostcheckPreviewProbe).mockImplementation(async () => failedProbe(OVERLAY));
    const buildErrors: unknown[] = [];
    expect(await runVersionPostchecks({ ...input, notifications: { buildError: error => buildErrors.push(error) } }))
      .toMatchObject({ kind: "stop", reason: "repair_settled" });
    expect(buildRepair.repairBuildErrorUnderLease).toHaveBeenCalledWith(expect.objectContaining({ holderRunId: "holder",
      repairDeadlineEpochMs: deadline, buildError: { stage: "preview-start", message: OVERLAY } }));
    expect(buildErrors).toEqual([{ stage: "preview-start", message: OVERLAY }]);
    expect(telemetry.recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v", false, { bootedFilesRevision: "r2" });
    expect(budget.recordServerResumeHold).not.toHaveBeenCalled();
    expect(product.runHeldVersionProductPostcheck).not.toHaveBeenCalled();
  });
  it.each([
    ["an empty-body verdict", "Preview served HTML with an empty body (no visible text before scripts)"],
    ["a failure without a message", null],
  ])("%s after start is still a runtime hold, not a repair", async (_label, readinessError) => {
    vi.mocked(probes.readProductPostcheckPreviewProbe).mockImplementation(async () => failedProbe(readinessError));
    expect(await runVersionPostchecks(input)).toMatchObject({ kind: "stop", reason: "runtime_hold", retryable: true });
    expect(buildRepair.repairBuildErrorUnderLease).not.toHaveBeenCalled();
  });
  it("a resume tick on a dead boot with a real build error reserves an attempt and repairs instead of holding again", async () => {
    vi.mocked(probes.readProductPostcheckPreviewProbe).mockImplementation(async () => {
      order.push("probe");
      return failedProbe(OVERLAY, false);
    });
    expect(await runVersionPostchecks({ ...input, entry: "resume" })).toMatchObject({ kind: "stop", reason: "repair_settled" });
    expect(budget.recordServerResumeHold).not.toHaveBeenCalled();
    expect(order.indexOf("probe")).toBeLessThan(order.indexOf("reserve"));
    expect(buildRepair.repairBuildErrorUnderLease).toHaveBeenCalledTimes(1);
    expect(budget.settleServerResumeAttempt).toHaveBeenCalledWith(expect.objectContaining({ runId: "holder" }), 1, "terminal");
  });
  it.each(["diagnostic_only", "gate_unconfigured"])("a resume tick on a dead boot still holds when repair is not allowed (%s)", async lane => {
    if (lane === "diagnostic_only") policy.serverVerify.diagnosticOnly = true;
    else vi.mocked(gate.isQualityGateConfigured).mockReturnValue(false);
    vi.mocked(probes.readProductPostcheckPreviewProbe).mockImplementation(async () => failedProbe(OVERLAY, false));
    expect(await runVersionPostchecks({ ...input, entry: "resume" })).toMatchObject({ kind: "stop", reason: "runtime_hold" });
    expect(budget.reserveServerResumeAttempt).not.toHaveBeenCalled();
    expect(buildRepair.repairBuildErrorUnderLease).not.toHaveBeenCalled();
  });
});
