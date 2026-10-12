import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/client", () => ({ dbConfigured: true, db: {}, pool: null }));
vi.mock("@/lib/logging/event-bus-subscribers", () => ({}));
vi.mock("@/lib/logging/event-bus-error-log-sink", () => ({}));
vi.mock("@/lib/logging/event-bus", () => ({ emit: vi.fn() }));
vi.mock("@/lib/db/promote-guard", () => ({ assertPromoteAllowed: vi.fn() }));
import * as repo from "@/lib/db/chat-repository-pg";
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
import { runVersionPostchecks } from "./verify-run";
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
      scopeId: "original", startPolicy: policy, finalize: [], consumed: [] } }));
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
    vi.spyOn(f3, "loadServerVerifyF3ReadinessContext").mockResolvedValue({ projectId: "p", orchestrationSnapshot: null } as never);
    vi.spyOn(f3, "evaluateServerOwnedF3Readiness").mockResolvedValue({ ready: true, ok: true } as never);
    vi.spyOn(f3, "persistF3ReadinessHold").mockResolvedValue(undefined);
    vi.spyOn(usage, "flushPendingUsageWrites").mockResolvedValue(undefined);
    vi.spyOn(billing, "settleExistingGenerationBillingIfPresent").mockResolvedValue(null);
    vi.spyOn(buildRepair, "repairBuildErrorUnderLease").mockResolvedValue({ started: true, repairAvailable: true,
      verification: { kind: "stop", reason: "repair_settled", retryable: false } });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); lease.inflight.clear(); });

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
});
