import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const snapshot = vi.hoisted(() => vi.fn());
const parse = vi.hoisted(() => vi.fn());
const active = vi.hoisted(() => vi.fn());
const start = vi.hoisted(() => vi.fn());
const write = vi.hoisted(() => vi.fn());
const stamp = vi.hoisted(() => vi.fn());
const canExpose = vi.hoisted(() => vi.fn());
const acquire = vi.hoisted(() => vi.fn());
const release = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/chat-repository-pg", () => ({
  updateVersionPreviewUrl: write, acquireVersionLease: acquire, releaseVersionLease: release,
}));
vi.mock("@/lib/db/engine-version-lifecycle", () => ({ canExposeEnginePreview: canExpose }));
vi.mock("@/lib/db/services/generation-telemetry", () => ({ recordPreviewRuntimeOutcomeForVersion: stamp }));
vi.mock("@/lib/gen/version-manager", () => ({ getVersionFilesSnapshot: snapshot, parseCodeFilesFromFilesJson: parse }));
vi.mock("./preview-session", () => ({ startPreviewSession: start }));
vi.mock("./session-store", () => ({ getActivePreviewSessionAsync: active }));
vi.mock("./preview-url-classifier", () => ({ isTier2LivePreviewUrl: () => true }));
vi.mock("./lifecycle-telemetry", () => ({ logPreviewLifecycleTelemetry: vi.fn() }));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/observability/metrics", () => ({ incIngressEvent: vi.fn() }));
import { ensureVersionPreview, persistVersionPreviewOutcome, type EnsureVersionPreviewInput } from "./ensure-version-preview";

const files = [{ path: "app/page.tsx", content: "content", language: "tsx" as const }];
const input: EnsureVersionPreviewInput = {
  chat: { id: "chat", project_id: "project" },
  version: { id: "version", files_json: JSON.stringify(files), files_revision: "rev",
    preview_url: "https://preview.example", lifecycle_stage: "integrations", selected_dossier_env_keys: ["STRIPE_SECRET_KEY"] },
  policy: { previewPolicy: "fidelity3", verificationPolicy: "strict" },
  forceRestart: false, holderRunId: "holder", expectedFilesRevision: "rev",
};
const result = { previewUrl: "https://preview.example", previewSessionId: "session",
  lifecycleToken: "life", filesRevision: "rev", previewMode: "dev_only", fidelityTier: 2,
  startOutcome: "recreated", runtimeReady: true };
const session = { ...result, versionId: "version" };

describe("ensureVersionPreview shared server orchestration", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.resetAllMocks();
    canExpose.mockReturnValue(true);
    snapshot.mockResolvedValue({ files, filesJson: JSON.stringify(files), filesRevision: "rev" });
    active.mockResolvedValue(null);
    start.mockResolvedValue({ ok: true, result });
    write.mockResolvedValue(true);
    stamp.mockResolvedValue(undefined);
  });

  it("uses explicit policy and preserves lifecycle, dossier-env and receipt identity", async () => {
    const outcome = await ensureVersionPreview(input);
    expect(start).toHaveBeenCalledWith(files, expect.objectContaining({
      previewPolicy: "fidelity3", verificationPolicy: "strict", lifecycleStage: "integrations",
      selectedDossierEnvKeys: ["STRIPE_SECRET_KEY"], filesRevisionForSession: "rev",
      skipRepair: true, skipProjectScaffold: true,
    }));
    expect(outcome).toMatchObject({ ok: true, result: {
      versionId: "version", filesRevision: "rev", previewSessionId: "session", lifecycleToken: "life",
    } });
    expect(acquire).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("threads the original deadline to start and refuses a late receipt", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    start.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(1_100); return { ok: true, result }; });
    expect(await ensureVersionPreview({ ...input, previewDeadlineEpochMs: 1_100 })).toEqual({
      ok: false, reason: "start_failed", error: { stage: "preview-start", message: "Preview time budget exhausted" },
    });
    expect(start).toHaveBeenCalledWith(files, expect.objectContaining({ previewDeadlineEpochMs: 1_100 }));
    expect(write).not.toHaveBeenCalled();
    expect(stamp).not.toHaveBeenCalled();
  });

  it("cannot reuse or persist a receipt after its caller deadline", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    active.mockResolvedValue(session);
    const outcome = await ensureVersionPreview({ ...input, previewDeadlineEpochMs: 1_100 });
    if (!outcome.ok) throw new Error("fixture failed");
    expect(outcome.result.previewDeadlineEpochMs).toBe(1_100);
    vi.mocked(Date.now).mockReturnValue(1_100);
    expect(await persistVersionPreviewOutcome({ receipt: outcome.result, holderRunId: "holder", expectedFilesRevision: "rev" })).toBe(false);
    expect(await ensureVersionPreview({ ...input, previewDeadlineEpochMs: 1_100 })).toEqual({
      ok: false, reason: "start_failed", error: { stage: "preview-start", message: "Preview time budget exhausted" },
    });
    expect(start).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(stamp).not.toHaveBeenCalled();
  });

  it("reuses only the exact active version/URL/revision/session", async () => {
    active.mockResolvedValue(session);
    expect(await ensureVersionPreview(input)).toMatchObject({
      ok: true, result: { startOutcome: "reused_url", lifecycleToken: "life", filesRevision: "rev" },
    });
    expect(start).not.toHaveBeenCalled();
  });

  it.each([{ filesRevision: "old" }, { versionId: "other" }, { previewUrl: "https://other.example" }, { previewSessionId: "" }])(
    "does not reuse a mismatched session: %j", async (delta) => {
      active.mockResolvedValue({ ...session, ...delta });
      expect(await ensureVersionPreview(input)).toMatchObject({ ok: true, result: { startOutcome: "recreated" } });
      expect(start).toHaveBeenCalledTimes(1);
    },
  );

  it("forceRestart bypasses exposure/reuse and preserves design env keys", async () => {
    canExpose.mockReturnValue(false);
    active.mockResolvedValue(session);
    await ensureVersionPreview({ ...input, forceRestart: true,
      version: { ...input.version, lifecycle_stage: "design" },
      policy: { previewPolicy: "fidelity2", verificationPolicy: "standard" } });
    expect(start).toHaveBeenCalledWith(files, expect.objectContaining({
      forceRestart: true, lifecycleStage: "design", selectedDossierEnvKeys: ["STRIPE_SECRET_KEY"],
    }));
    expect(active).not.toHaveBeenCalled();
  });

  it("blocks failed lifecycle without forceRestart", async () => {
    canExpose.mockReturnValue(false);
    expect(await ensureVersionPreview(input)).toEqual({ ok: false, reason: "preview_blocked" });
    expect(start).not.toHaveBeenCalled();
  });

  it("stops when the snapshot changed before boot", async () => {
    snapshot.mockResolvedValue({ files, filesRevision: "new" });
    expect(await ensureVersionPreview(input)).toEqual({ ok: false, reason: "version_changed" });
    expect(start).not.toHaveBeenCalled();
  });

  it.each([null, "new"])("strict chain never substitutes a missing/wrong host revision (%s)", async (revision) => {
    start.mockResolvedValue({ ok: true, result: { ...result, filesRevision: revision } });
    expect(await ensureVersionPreview(input)).toEqual({ ok: false, reason: "version_changed" });
    expect(write).not.toHaveBeenCalled();
  });

  it("missing revision/holder cannot degrade a strict call to compatibility", async () => {
    expect(await ensureVersionPreview({ ...input, expectedFilesRevision: "" })).toEqual({ ok: false, reason: "version_changed" });
    expect(await ensureVersionPreview({ ...input, holderRunId: "" })).toEqual({ ok: false, reason: "version_changed" });
    expect(start).not.toHaveBeenCalled();
  });

  it("HTTP compatibility also rejects an explicitly mismatched host receipt", async () => {
    const httpInput = { chat: input.chat, version: input.version,
      policy: input.policy, forceRestart: input.forceRestart };
    start.mockResolvedValue({ ok: true, result: { ...result, filesRevision: "other" } });
    expect(await ensureVersionPreview(httpInput)).toEqual({ ok: false, reason: "version_changed" });
    expect(write).not.toHaveBeenCalled();
  });

  it("copies frozen files/env/policy inputs and does not mutate trusted rows", async () => {
    const frozenFiles = Object.freeze(files.map((file) => Object.freeze({ ...file })));
    snapshot.mockResolvedValue({ files: frozenFiles, filesRevision: "rev" });
    const keys = Object.freeze(["STRIPE_SECRET_KEY"]);
    await ensureVersionPreview(Object.freeze({ ...input,
      version: Object.freeze({ ...input.version, selected_dossier_env_keys: keys as unknown as string[] }),
      policy: Object.freeze(input.policy) }));
    expect(start.mock.calls[0][0]).not.toBe(frozenFiles);
    expect(start.mock.calls[0][0][0]).not.toBe(frozenFiles[0]);
    expect(start.mock.calls[0][1].selectedDossierEnvKeys).not.toBe(keys);
  });

  it("awaits the same fenced bookkeeping without after() or fire-and-forget", async () => {
    const outcome = await ensureVersionPreview(input);
    if (!outcome.ok) throw new Error("fixture failed");
    let resolveWrite!: (value: boolean) => void;
    write.mockImplementation(() => new Promise<boolean>((resolve) => { resolveWrite = resolve; }));
    let settled = false;
    const pending = persistVersionPreviewOutcome({ receipt: outcome.result,
      holderRunId: "holder", expectedFilesRevision: "rev" }).then((value) => { settled = true; return value; });
    expect(settled).toBe(false);
    expect(stamp).not.toHaveBeenCalled();
    resolveWrite(true);
    expect(await pending).toBe(true);
    expect(write).toHaveBeenCalledWith("version", "https://preview.example", {
      lockTimeoutMs: 2000, maxRetries: 3, retryDelayMs: 300,
      expectedFilesRevision: "rev", holderRunId: "holder",
    });
    expect(stamp).toHaveBeenCalledWith("version", true, { bootedFilesRevision: "rev" });
  });

  it("lost holder/stale persist returns false and cannot stamp readiness", async () => {
    const outcome = await ensureVersionPreview(input);
    if (!outcome.ok) throw new Error("fixture failed");
    write.mockResolvedValue(false);
    expect(await persistVersionPreviewOutcome({ receipt: outcome.result,
      holderRunId: "holder", expectedFilesRevision: "rev" })).toBe(false);
    expect(stamp).not.toHaveBeenCalled();
  });

  it("unconfirmed boot never stamps runtime readiness", async () => {
    start.mockResolvedValue({ ok: true, result: { ...result, runtimeReady: false } });
    const outcome = await ensureVersionPreview(input);
    if (!outcome.ok) throw new Error("fixture failed");
    await persistVersionPreviewOutcome({ receipt: outcome.result, holderRunId: "holder", expectedFilesRevision: "rev" });
    expect(stamp).not.toHaveBeenCalled();
  });

  it("import alone performs no preview, persistence, DB or lease mutation", async () => {
    vi.clearAllMocks();
    vi.resetModules();
    await import("./ensure-version-preview");
    for (const mock of [snapshot, active, start, write, stamp, acquire, release]) expect(mock).not.toHaveBeenCalled();
  });
});
