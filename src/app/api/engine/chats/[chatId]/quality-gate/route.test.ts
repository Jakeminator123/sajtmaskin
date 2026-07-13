import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const getVersionById = vi.hoisted(() => vi.fn());
const checkTier3ReadinessForVersion = vi.hoisted(() => vi.fn());
const markVersionVerifying = vi.hoisted(() => vi.fn());
const markVersionSupersededByRepair = vi.hoisted(() => vi.fn());
const promoteVersion = vi.hoisted(() => vi.fn());
const failVersionVerification = vi.hoisted(() => vi.fn());
const acquireVersionLease = vi.hoisted(() => vi.fn());
const releaseVersionLease = vi.hoisted(() => vi.fn());
const resetVersionVerificationToPending = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const buildExportableProject = vi.hoisted(() => vi.fn());
const isQualityGateConfigured = vi.hoisted(() => vi.fn());
const exportableToQualityGateFiles = vi.hoisted(() => vi.fn());
const maybeAnalyzeVisualQAForPassedExportable = vi.hoisted(() => vi.fn());
const describeQualityGateVerification = vi.hoisted(() => vi.fn());
const runQualityGateChecks = vi.hoisted(() => vi.fn());
const qualityGateAllPassed = vi.hoisted(() => vi.fn());
const buildServerVerifyQualityGateMeta = vi.hoisted(() => vi.fn());
const compactVisualQAForQualityGateLog = vi.hoisted(() => vi.fn());
const assertPromoteAllowed = vi.hoisted(() => vi.fn());
const QualityGateUnavailableError = vi.hoisted(
  () =>
    class QualityGateUnavailableError extends Error {
      retryable: boolean;
      constructor(message: string, retryable: boolean) {
        super(message);
        this.name = "QualityGateUnavailableError";
        this.retryable = retryable;
      }
    },
);

// Pass-through the rate limiter so the suite is deterministic regardless of how
// many requests the tests fire (the real in-memory limiter otherwise starts
// returning 429 after ~a dozen calls in a single run).
vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: unknown, _key: unknown, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/promote-guard", () => ({
  assertPromoteAllowed,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
}));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  failVersionVerification,
  getLatestVersion,
  getVersionById,
  markVersionVerifying,
  markVersionSupersededByRepair,
  promoteVersion,
  acquireVersionLease,
  releaseVersionLease,
  resetVersionVerificationToPending,
}));

vi.mock("@/lib/integrations/tier3-readiness-gate", () => ({
  checkTier3ReadinessForVersion,
}));

vi.mock("@/lib/gen/export/build-exportable-project", () => ({
  buildExportableProject,
}));

vi.mock("@/lib/gen/verify/preview-quality-gate", () => ({
  QUALITY_GATE_COMMANDS: {
    typecheck: "node ./node_modules/typescript/bin/tsc --noEmit",
    lint: "node ./node_modules/eslint/bin/eslint.js . --format stylish --no-color",
    build: "node ./node_modules/next/dist/bin/next build",
  },
  QUALITY_GATE_SETUP_HINT: "hint",
  QualityGateNotConfiguredError: class QualityGateNotConfiguredError extends Error {},
  QualityGateUnavailableError,
  describeQualityGateVerification,
  exportableToQualityGateFiles,
  isQualityGateConfigured,
  maybeAnalyzeVisualQAForPassedExportable,
  runQualityGateChecks,
  qualityGateAllPassed,
}));

vi.mock("@/lib/gen/verify/server-verify-log-meta", () => ({
  buildServerVerifyQualityGateMeta,
  compactVisualQAForQualityGateLog,
}));

import { POST } from "./route";
import {
  DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
  INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS,
} from "@/lib/gen/verify/quality-gate-checks";

describe("POST quality-gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    getVersionById.mockResolvedValue({ id: "ver-f2", chat_id: "chat-1" });
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: true,
      spec: { requirements: [] },
    });
    markVersionVerifying.mockResolvedValue({ id: "ver-1" });
    markVersionSupersededByRepair.mockResolvedValue({ id: "ver-1" });
    createEngineVersionErrorLogs.mockResolvedValue([]);
    failVersionVerification.mockResolvedValue({ id: "ver-1" });
    promoteVersion.mockResolvedValue({ id: "ver-1" });
    acquireVersionLease.mockResolvedValue({ runId: "run-1" });
    releaseVersionLease.mockResolvedValue(undefined);
    resetVersionVerificationToPending.mockResolvedValue({ id: "ver-1" });
    assertPromoteAllowed.mockResolvedValue({ allowed: true });
    maybeAnalyzeVisualQAForPassedExportable.mockReturnValue(undefined);
    describeQualityGateVerification.mockReturnValue("Automatic verification passed.");
  });

  it("rejects an empty checks array before touching verify dependencies", async () => {
    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: [] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(JSON.stringify(body.details)).toContain("At least one quality gate check is required.");
    expect(getEngineVersionForChatByIdForRequest).not.toHaveBeenCalled();
    expect(getVersionFiles).not.toHaveBeenCalled();
    expect(runQualityGateChecks).not.toHaveBeenCalled();
  });

  it("enforces tenant/chat version ownership before deterministic ReleaseGate", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver-foreign",
          gate: "integrationsBuild",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Version not found for chat" });
    expect(getVersionFiles).not.toHaveBeenCalled();
    expect(runQualityGateChecks).not.toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
  });

  it("rejects direct integrationsBuild on an F2 design row", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-f2", lifecycle_stage: "design" },
    });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver-f2",
          gate: "integrationsBuild",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "integrations_version_required",
    });
    expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
    expect(runQualityGateChecks).not.toHaveBeenCalled();
  });

  it("keeps direct integrationsBuild behind shared env readiness", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1", project_id: "project-1", orchestration_snapshot: null },
      version: {
        id: "ver-f3",
        lifecycle_stage: "integrations",
        parent_version_id: "ver-f2",
      },
    });
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "missing_env",
      spec: { requirements: [] },
      readiness: {
        ready: false,
        missingByIntegration: [
          { key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"] },
        ],
      },
    });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver-f3",
          gate: "integrationsBuild",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(res.status).toBe(412);
    expect(await res.json()).toMatchObject({
      error: "tier3_env_not_ready",
      parentVersionId: "ver-f2",
    });
    expect(runQualityGateChecks).not.toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
  });

  it("keeps direct integrationsBuild behind the F2 parent Product Postcheck", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1", project_id: null, orchestration_snapshot: null },
      version: {
        id: "ver-f3",
        lifecycle_stage: "integrations",
        parent_version_id: "ver-f2",
      },
    });
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "product_postcheck_blocked",
    });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver-f3",
          gate: "integrationsBuild",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: "product_postcheck_blocked",
      parentVersionId: "ver-f2",
    });
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
      expect.objectContaining({ productPostcheckVersionId: "ver-f2" }),
    );
    expect(runQualityGateChecks).not.toHaveBeenCalled();
  });

  it("marks the result superseded when a newer version exists before state mutation", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([{ path: "app/page.tsx", content: "export default function Page(){}" }]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([{ path: "app/page.tsx", content: "export default function Page(){}" }]);
    exportableToQualityGateFiles.mockReturnValue([{ name: "app/page.tsx", content: "export default function Page(){}" }]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-2" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.superseded).toBe(true);
    expect(body.promoted).toBe(false);
    expect(markVersionSupersededByRepair).toHaveBeenCalledWith("ver-1", null, "run-1");
    expect(promoteVersion).not.toHaveBeenCalled();
  });

  it("marks the version failed and returns passed:false when the promote guard blocks", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    // Finalize verifier flagged blocking findings → guard refuses promotion.
    assertPromoteAllowed.mockResolvedValue({
      allowed: false,
      signal: "verifier_failed",
      reason: "finalize quality gate = verifier_failed",
    });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    // A blocked row must never call promote, and must read as not-green.
    expect(promoteVersion).not.toHaveBeenCalled();
    expect(failVersionVerification).toHaveBeenCalledWith(
      "ver-1",
      expect.stringContaining("promotion was blocked"),
      "run-1",
    );
    expect(body.passed).toBe(false);
    expect(body.vmGatePassed).toBe(true);
    expect(body.promotionBlocked).toBe(true);
    expect(body.promotionBlockedReason).toBe("finalize_quality_gate_failed");
  });

  it("returns passed:false + promoteError (not a verifier block) on a transient promote failure", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    // Guard allows, but the promote write fails transiently (DB hiccup/race).
    assertPromoteAllowed.mockResolvedValue({ allowed: true });
    promoteVersion.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(promoteVersion).toHaveBeenCalledWith("ver-1", expect.any(String), "run-1");
    // Transient failure must NOT be mislabeled as a verifier block.
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(body.passed).toBe(false);
    expect(body.promoteError).toBe(true);
    expect(body.promoted).toBe(false);
    expect(body.promotionBlocked).toBeUndefined();
  });

  it("M#vlane2/BB#299: retries a transient promote statement-timeout, then promotes without failing the version", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-07-13T06:00:00.000Z",
      jobFinishedAt: "2026-07-13T06:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    assertPromoteAllowed.mockResolvedValue({ allowed: true });
    // First promote UPDATE dies on the prod-incident statement_timeout, then the
    // bounded retry succeeds. This must NOT leave the row false-red.
    const timeoutErr = Object.assign(
      new Error("canceling statement due to statement timeout"),
      { code: "57014" },
    );
    promoteVersion
      .mockRejectedValueOnce(timeoutErr)
      .mockResolvedValueOnce({ id: "ver-1" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    // The transient timeout was retried (2 attempts) and succeeded.
    expect(promoteVersion).toHaveBeenCalledTimes(2);
    expect(promoteVersion).toHaveBeenLastCalledWith("ver-1", expect.any(String), "run-1");
    // A retried-then-successful promote must read green, never false-red.
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(body.passed).toBe(true);
    expect(body.promoted).toBe(true);
    expect(body.promoteError).toBeUndefined();
  });

  it("M#vlane2/BB#299: gives up after bounded promote retries on a persistent transient timeout (promoteError, not false-red)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-07-13T06:00:00.000Z",
      jobFinishedAt: "2026-07-13T06:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    assertPromoteAllowed.mockResolvedValue({ allowed: true });
    // Every attempt times out → exhaust the bounded retries and surface a
    // retryable promoteError. The row is NEVER marked failed (no false-red).
    promoteVersion.mockRejectedValue(
      Object.assign(new Error("canceling statement due to statement timeout"), {
        code: "57014",
      }),
    );

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    // 1 initial attempt + 2 retries = 3 total.
    expect(promoteVersion).toHaveBeenCalledTimes(3);
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(body.passed).toBe(false);
    expect(body.promoteError).toBe(true);
    expect(body.promoted).toBe(false);
    expect(body.promotionBlocked).toBeUndefined();
  });

  it("promotes a clean passed gate when the guard allows it", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    // Guard allows promotion (default mock returns a truthy promoted row).
    promoteVersion.mockResolvedValue({ id: "ver-1" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(promoteVersion).toHaveBeenCalledWith("ver-1", expect.any(String), "run-1");
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(body.passed).toBe(true);
    expect(body.promotionBlocked).toBeUndefined();
    expect(body.promoteError).toBeUndefined();
    // TOCTOU fix: the fileset is read EXACTLY ONCE under the lease and threaded
    // to readiness/export/verify — no pre-lease read and no leased re-read.
    expect(getVersionFiles).toHaveBeenCalledTimes(1);
  });

  it("fails closed (retryable) without promoting or failing when the guard is indeterminate (B08)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    // Guard could not read the finalize signal (DB error) → indeterminate.
    assertPromoteAllowed.mockResolvedValue({
      allowed: false,
      indeterminate: true,
      reason: "promote guard signal unavailable: db timeout",
    });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    // Fail closed: no promotion. Fail safe: not terminally failed either.
    expect(promoteVersion).not.toHaveBeenCalled();
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(body.passed).toBe(false);
    expect(body.vmGatePassed).toBe(true);
    expect(body.promoteError).toBe(true);
    expect(body.promoteGuardUnavailable).toBe(true);
    expect(body.promotionBlocked).toBeUndefined();
    // Opted into fail-closed reads.
    expect(assertPromoteAllowed).toHaveBeenCalledWith(
      "ver-1",
      undefined,
      { onReadError: "indeterminate" },
    );
  });

  it("fails closed (retryable) when the guard itself throws", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    // Guard throws unexpectedly → route .catch must fail closed, not open.
    assertPromoteAllowed.mockRejectedValue(new Error("boom"));

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(promoteVersion).not.toHaveBeenCalled();
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(body.passed).toBe(false);
    expect(body.promoteError).toBe(true);
    expect(body.promoteGuardUnavailable).toBe(true);
  });

  it("returns 409 version_busy when another job holds the version lease (Plan C)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    // Another verify/repair run already owns the active lease.
    acquireVersionLease.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("version_busy");
    // No state mutation or gate run when the lock is held elsewhere.
    expect(markVersionVerifying).not.toHaveBeenCalled();
    expect(runQualityGateChecks).not.toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
  });

  it("fails closed with a retryable 503 (lease_unavailable) when acquiring the lease throws — never reaches readiness/verify (TOCTOU)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1", project_id: null, orchestration_snapshot: null },
      version: {
        id: "ver-1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver-f2",
      },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    // A thrown acquire (DB error) must NOT fall through as if the lease were held
    // (the historic fail-open let a stale pre-lease snapshot promote).
    acquireVersionLease.mockRejectedValue(new Error("db connection reset"));

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver-1",
          gate: "integrationsBuild",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.code).toBe("lease_unavailable");
    expect(body.retryable).toBe(true);
    // Fail-closed: the lease gate runs FIRST, so a thrown acquire short-circuits
    // before the file read, the readiness check, verify and any state mutation —
    // and never releases a lease that was never taken.
    expect(getVersionFiles).not.toHaveBeenCalled();
    expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
    expect(markVersionVerifying).not.toHaveBeenCalled();
    expect(runQualityGateChecks).not.toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(releaseVersionLease).not.toHaveBeenCalled();
  });

  it("a throw BEFORE the verify lane (export step) returns retryable 503 without false-RED, and still releases the lease", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1", project_id: null, orchestration_snapshot: null },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    // Transient failure during export — the verify lane never evaluated the
    // code, so the version must NOT be marked failed (granska-svärm F1 on the
    // TOCTOU fix: the widened try/catch previously false-REDed this case).
    buildExportableProject.mockRejectedValue(new Error("disk full"));

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.code).toBe("quality_gate_unavailable");
    expect(body.retryable).toBe(true);
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(markVersionVerifying).not.toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
    expect(releaseVersionLease).toHaveBeenCalledWith("ver-1", "run-1");
  });

  it("releases the lease when the F3 readiness check bails (412) after acquire", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1", project_id: null, orchestration_snapshot: null },
      version: {
        id: "ver-1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver-f2",
      },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "missing_env",
      readiness: { missingByIntegration: { stripe: ["STRIPE_SECRET_KEY"] } },
    });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", gate: "integrationsBuild" }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(res.status).toBe(412);
    // The lease was taken before readiness, so the early 412 return must
    // still release it (finally-block contract).
    expect(releaseVersionLease).toHaveBeenCalledWith("ver-1", "run-1");
    expect(failVersionVerification).not.toHaveBeenCalled();
  });

  it("TOCTOU core: the exported/verified fileset is the SAME lease-protected read that fed readiness", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1", project_id: null, orchestration_snapshot: null },
      version: {
        id: "ver-1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver-f2",
      },
    });
    const snapshotFiles = [
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ];
    getVersionFiles.mockResolvedValue(snapshotFiles);
    isQualityGateConfigured.mockReturnValue(true);
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: true,
      spec: { requirements: [] },
    });
    buildExportableProject.mockResolvedValue(snapshotFiles);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    // Real runQualityGateChecks response shape (Codex P1 on #504): a stub
    // shape made the handler throw before promotion while the test stayed
    // green because it discarded the response — the assertions below must
    // prove the FULL readiness→verify→promote path ran on the same snapshot.
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    describeQualityGateVerification.mockReturnValue("ok");
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    maybeAnalyzeVisualQAForPassedExportable.mockResolvedValue(null);
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    assertPromoteAllowed.mockResolvedValue({ allowed: true });
    promoteVersion.mockResolvedValue({ id: "ver-1" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", gate: "integrationsBuild" }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    // The full readiness→verify→promote path actually ran and succeeded —
    // otherwise the fileset assertions below could pass on a handler that
    // threw before promotion (Codex P1 on #504).
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
    expect(body.promoted).toBe(true);
    expect(promoteVersion).toHaveBeenCalled();
    // One read under the lease…
    expect(getVersionFiles).toHaveBeenCalledTimes(1);
    // …fed byte-identically to BOTH the readiness gate and the export step.
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
      expect.objectContaining({ preloadedFiles: snapshotFiles }),
    );
    expect(buildExportableProject).toHaveBeenCalledWith(snapshotFiles);
  });

  it("returns a retryable 503 (NOT failed) when the verify lane is unreachable", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    // Preview-host unreachable (network/timeout/HTTP) → typed, retryable error.
    runQualityGateChecks.mockRejectedValue(
      new QualityGateUnavailableError("fetch failed", true),
    );

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.code).toBe("quality_gate_unavailable");
    expect(body.retryable).toBe(true);
    // An unreachable gate verified nothing — it must NOT false-RED the version.
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
    // The optimistic `verifying` transition is reverted to `pending` so the
    // readiness watchdog can't later false-RED a row with no running job.
    expect(resetVersionVerificationToPending).toHaveBeenCalledWith(
      "ver-1",
      undefined,
      "run-1",
    );
    // The distributed lease is still released in the `finally`.
    expect(releaseVersionLease).toHaveBeenCalledWith("ver-1", "run-1");
  });

  it("forces the F3 integrations build+lint lane even when the client posts the typecheck-only design lane (M#p4qg)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1", project_id: null, orchestration_snapshot: null },
      // F3 / integrations row: lifecycle_stage is the server-owned source of truth.
      version: {
        id: "ver-1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver-f2",
      },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Client unconditionally posts the typecheck-only DESIGN_PREVIEW lane.
        body: JSON.stringify({
          versionId: "ver-1",
          checks: ["typecheck"],
        }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(res.status).toBe(200);
    // Server-authoritative override: the F3 row is verified on the full
    // integrations build lane (typecheck + lint + build), NOT typecheck-only —
    // the client can no longer downgrade an F3 version to a false-green gate.
    expect(runQualityGateChecks).toHaveBeenCalledTimes(1);
    const f3Checks = runQualityGateChecks.mock.calls[0][0].checks;
    expect(f3Checks).toEqual([...INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS]);
    expect(f3Checks).toContain("build");
    expect(f3Checks).toContain("lint");
    expect(f3Checks).not.toEqual(["typecheck"]);
  });

  it("runs direct integrationsBuild only on an F3 fork and promotes after shared readiness passes", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: {
        id: "chat-1",
        project_id: "project-1",
        orchestration_snapshot: { selectedDossierIds: ["openai-chat"] },
      },
      version: {
        id: "ver-1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver-f2",
      },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver-1",
          gate: "integrationsBuild",
          checks: ["typecheck"],
          // Unknown client lineage metadata must never affect gate selection.
          lineageHash: "client-controlled-lineage",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(res.status).toBe(200);
    expect(runQualityGateChecks.mock.calls[0][0].checks).toEqual([
      "typecheck",
      "lint",
      "build",
    ]);
    expect(promoteVersion).toHaveBeenCalledTimes(1);
    expect(runQualityGateChecks.mock.invocationCallOrder[0]).toBeLessThan(
      promoteVersion.mock.invocationCallOrder[0],
    );
    // TOCTOU fix: the lease is acquired BEFORE the readiness check runs, so both
    // readiness and the verify/promote all evaluate one lease-protected snapshot.
    expect(acquireVersionLease.mock.invocationCallOrder[0]).toBeLessThan(
      checkTier3ReadinessForVersion.mock.invocationCallOrder[0],
    );
    // Readiness is fed the SAME fileset the route read once under the lease.
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith({
      versionId: "ver-1",
      productPostcheckVersionId: "ver-f2",
      orchestrationSnapshot: { selectedDossierIds: ["openai-chat"] },
      projectId: "project-1",
      preloadedFiles: [{ path: "app/page.tsx", content: "export default function Page(){}" }],
    });
    expect(await res.json()).toMatchObject({ passed: true, promoted: true });
  });

  it("forces F2 to typecheck-only even when the client requests lint/build", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1", lifecycle_stage: "design" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["lint", "build"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(res.status).toBe(200);
    expect(runQualityGateChecks).toHaveBeenCalledTimes(1);
    const f2Checks = runQualityGateChecks.mock.calls[0][0].checks;
    expect(f2Checks).toEqual([...DESIGN_PREVIEW_QUALITY_GATE_CHECKS]);
  });

  it("F2 render-first: a typecheck-only failure is advisory — promotes (not failed), no auto-repair (#330)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1", lifecycle_stage: "design" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    // Typecheck failed, but `next dev` renders JS despite TS type errors.
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: false, exitCode: 2, output: "TS2339", durationMs: 12 }],
      verifyLaneDurationMs: 12,
      firstFailureCheck: "typecheck",
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.012Z",
    });
    qualityGateAllPassed.mockReturnValue(false);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    assertPromoteAllowed.mockResolvedValue({ allowed: true });
    promoteVersion.mockResolvedValue({ id: "ver-1" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    // Advisory: promote instead of fail; client sees passed:true so no repair,
    // but vmGatePassed:false + designAdvisory keep it from reading solid-green.
    expect(promoteVersion).toHaveBeenCalledWith("ver-1", expect.any(String), "run-1");
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(body.passed).toBe(true);
    expect(body.vmGatePassed).toBe(false);
    expect(body.designAdvisory).toBe(true);
    expect(body.advisoryChecks).toEqual(["typecheck"]);
  });

  it("deterministic F3 integrationsBuild keeps a typecheck failure hard and never promotes", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1", project_id: null, orchestration_snapshot: null },
      version: {
        id: "ver-1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver-f2",
      },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [
        {
          check: "typecheck",
          passed: false,
          exitCode: 2,
          output: "app/page.tsx(1,1): error TS2339: Property missing",
          durationMs: 12,
        },
      ],
      verifyLaneDurationMs: 12,
      firstFailureCheck: "typecheck",
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.012Z",
    });
    qualityGateAllPassed.mockReturnValue(false);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver-1",
          gate: "integrationsBuild",
          checks: ["typecheck"],
        }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(runQualityGateChecks.mock.calls[0][0].checks).toEqual([
      ...INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS,
    ]);
    expect(failVersionVerification).toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
    expect(body.passed).toBe(false);
    expect(body.promoted).toBe(false);
    expect(body.designAdvisory).toBeUndefined();
  });

  it("F3 promotes warning-only lint as advisory without failing the gate", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1", project_id: null, orchestration_snapshot: null },
      version: {
        id: "ver-1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver-f2",
      },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [
        { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 5 },
        {
          check: "lint",
          passed: true,
          advisory: true,
          repairable: false,
          warningCount: 2,
          errorCount: 0,
          exitCode: 0,
          output: "2 warnings",
          durationMs: 5,
        },
        { check: "build", passed: true, exitCode: 0, output: "", durationMs: 20 },
      ],
      verifyLaneDurationMs: 30,
      firstFailureCheck: null,
      jobStartedAt: "2026-07-13T10:00:00.000Z",
      jobFinishedAt: "2026-07-13T10:00:00.030Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(promoteVersion).toHaveBeenCalled();
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      passed: true,
      promoted: true,
      qualityGateAdvisory: true,
      advisoryChecks: ["lint"],
    });
  });

  it.each(["build", "lint"] as const)(
    "deterministic F3 integrationsBuild keeps %s failure hard and never promotes",
    async (failedCheck) => {
      getEngineVersionForChatByIdForRequest.mockResolvedValue({
        chat: { id: "chat-1", project_id: null, orchestration_snapshot: null },
        version: {
          id: "ver-1",
          lifecycle_stage: "integrations",
          parent_version_id: "ver-f2",
        },
      });
      getVersionFiles.mockResolvedValue([
        { path: "app/page.tsx", content: "export default function Page(){}" },
      ]);
      isQualityGateConfigured.mockReturnValue(true);
      buildExportableProject.mockResolvedValue([
        { path: "app/page.tsx", content: "export default function Page(){}" },
      ]);
      exportableToQualityGateFiles.mockReturnValue([
        { name: "app/page.tsx", content: "export default function Page(){}" },
      ]);
      runQualityGateChecks.mockResolvedValue({
        results: [
          {
            check: failedCheck,
            passed: false,
            exitCode: 1,
            output: `${failedCheck} failed`,
            durationMs: 12,
          },
        ],
        verifyLaneDurationMs: 12,
        firstFailureCheck: failedCheck,
        jobStartedAt: "2026-04-13T10:00:00.000Z",
        jobFinishedAt: "2026-04-13T10:00:00.012Z",
      });
      qualityGateAllPassed.mockReturnValue(false);
      buildServerVerifyQualityGateMeta.mockReturnValue({});
      getLatestVersion.mockResolvedValue({ id: "ver-1" });

      const res = await POST(
        new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            versionId: "ver-1",
            gate: "integrationsBuild",
          }),
        }),
        { params: Promise.resolve({ chatId: "chat-1" }) },
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(failVersionVerification).toHaveBeenCalled();
      expect(promoteVersion).not.toHaveBeenCalled();
      expect(body).toMatchObject({ passed: false, promoted: false });
    },
  );

  it("F2 defensively treats an unexpected host build failure as hard", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1", lifecycle_stage: "design" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    // The server requests typecheck-only, but an unexpected extra host result
    // must still never be advisory-promoted.
    runQualityGateChecks.mockResolvedValue({
      results: [
        { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 },
        { check: "build", passed: false, exitCode: 1, output: "build error", durationMs: 40 },
      ],
      verifyLaneDurationMs: 50,
      firstFailureCheck: "build",
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.050Z",
    });
    qualityGateAllPassed.mockReturnValue(false);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck", "build"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(runQualityGateChecks.mock.calls[0][0].checks).toEqual(["typecheck"]);
    expect(failVersionVerification).toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
    expect(body.passed).toBe(false);
    expect(body.designAdvisory).toBeUndefined();
  });

  it("F3: a typecheck failure stays HARD (never advisory)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1", project_id: null, orchestration_snapshot: null },
      version: {
        id: "ver-1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver-f2",
      },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: false, exitCode: 2, output: "TS2339", durationMs: 12 }],
      verifyLaneDurationMs: 12,
      firstFailureCheck: "typecheck",
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.012Z",
    });
    qualityGateAllPassed.mockReturnValue(false);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver-1",
          gate: "integrationsBuild",
          checks: ["typecheck"],
        }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(failVersionVerification).toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
    expect(body.passed).toBe(false);
    expect(body.designAdvisory).toBeUndefined();
  });
});
