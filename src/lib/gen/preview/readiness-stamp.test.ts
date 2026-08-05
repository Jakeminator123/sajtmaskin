import { beforeEach, describe, expect, it, vi } from "vitest";

const recordPreviewRuntimeOutcomeForVersion = vi.hoisted(() =>
  vi.fn<(versionId: string, previewSuccess: boolean) => Promise<void>>(async () => undefined),
);
const createEngineVersionErrorLogs = vi.hoisted(() =>
  vi.fn<(payloads: unknown[], opts?: unknown) => Promise<unknown[]>>(async () => []),
);
type StoredFile = { path: string; content: string; language?: string };
const getVersionFilesSnapshot = vi.hoisted(() =>
  vi.fn<
    (versionId: string) => Promise<{
      files: StoredFile[];
      filesJson: string;
      lifecycleStage: "design" | "integrations";
    } | null>
  >(async () => null),
);
/** Mirror the production snapshot contract: filesJson IS the parsed files. */
const snapshotOf = (files: StoredFile[]) => ({
  files,
  filesJson: JSON.stringify(files),
  lifecycleStage: "design" as const,
});
const updateVersionFiles = vi.hoisted(() =>
  vi.fn<
    (
      versionId: string,
      filesJson: string,
      options?: { preservePreviewUrl?: boolean; expectedFilesJson?: string },
    ) => Promise<boolean>
  >(async () => true),
);

vi.mock("@/lib/db/services/generation-telemetry", () => ({
  recordPreviewRuntimeOutcomeForVersion,
}));
vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
}));
vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFilesSnapshot,
}));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  updateVersionFiles,
}));

import {
  __resetPersistedLockfileGuardForTesting,
  applyPreviewReadinessOutcome,
  decidePreviewReadinessOutcome,
  persistRegeneratedLockfileForVersion,
} from "./readiness-stamp";
import { LOCKFILE_STALE_MARKER_PATH } from "@/lib/gen/autofix/dep-completer";

describe("decidePreviewReadinessOutcome", () => {
  it("stamps true when the host reports ready", () => {
    expect(
      decidePreviewReadinessOutcome({
        readinessState: "ready",
        readinessError: null,
        regeneratedLockfile: null,
        httpReady: true,
      }),
    ).toMatchObject({ previewSuccess: true, buildError: null });
  });

  it("stamps true when ready and httpReady is omitted (undefined)", () => {
    expect(
      decidePreviewReadinessOutcome({
        readinessState: "ready",
        readinessError: null,
        regeneratedLockfile: null,
        httpReady: undefined as unknown as boolean,
      }),
    ).toMatchObject({ previewSuccess: true });
  });

  it("does NOT stamp true when ready but httpReady is explicitly false (contradictory)", () => {
    expect(
      decidePreviewReadinessOutcome({
        readinessState: "ready",
        readinessError: null,
        regeneratedLockfile: null,
        httpReady: false,
      }),
    ).toMatchObject({ previewSuccess: null });
  });

  it("does NOT stamp true when readinessState is null/unknown (Bugbot finding 1)", () => {
    expect(
      decidePreviewReadinessOutcome({
        readinessState: null,
        readinessError: null,
        regeneratedLockfile: null,
        httpReady: false,
      }),
    ).toMatchObject({ previewSuccess: null, buildError: null });
  });

  it("does NOT stamp true when readinessState is undefined (unknown)", () => {
    expect(
      decidePreviewReadinessOutcome({
        readinessState: undefined as unknown as null,
        readinessError: null,
        regeneratedLockfile: null,
        httpReady: false,
      }),
    ).toMatchObject({ previewSuccess: null });
  });

  it("leaves telemetry untouched while still starting", () => {
    expect(
      decidePreviewReadinessOutcome({
        readinessState: "starting",
        readinessError: null,
        regeneratedLockfile: null,
        httpReady: false,
      }),
    ).toMatchObject({ previewSuccess: null, buildError: null });
  });

  it("stamps false + surfaces a build error when readiness failed", () => {
    const decision = decidePreviewReadinessOutcome({
      readinessState: "failed",
      readinessError: "Module not found: radix-ui",
      regeneratedLockfile: null,
      httpReady: false,
    });
    expect(decision.previewSuccess).toBe(false);
    expect(decision.buildError).toContain("radix-ui");
  });

  it("maps persistent empty-body readiness failure to stamp false (not true / not pending)", () => {
    const decision = decidePreviewReadinessOutcome({
      readinessState: "failed",
      readinessError:
        "Runtime did not become ready within 600000ms. Last error: HTTP 200 HTML but body text still empty (compiling or blank page)",
      regeneratedLockfile: null,
      httpReady: false,
    });
    expect(decision.previewSuccess).toBe(false);
    expect(decision.buildError).toMatch(/body text still empty/i);
  });
});

describe("applyPreviewReadinessOutcome (regression 4 — build-overlay after start)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetPersistedLockfileGuardForTesting();
  });

  it("stamps preview_success=false + registers an error row on a build-error overlay", async () => {
    await applyPreviewReadinessOutcome({
      chatId: "chat_1",
      versionId: "v1",
      resumed: {
        readinessState: "failed",
        readinessError: "Module not found: Can't resolve 'radix-ui'",
        regeneratedLockfile: null,
        httpReady: false,
      },
    });

    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v1", false);
    expect(createEngineVersionErrorLogs).toHaveBeenCalledTimes(1);
    const [payloads] = createEngineVersionErrorLogs.mock.calls[0] as [
      Array<{ versionId: string; level: string; message: string }>,
    ];
    expect(payloads[0]).toMatchObject({ versionId: "v1", level: "error" });
    expect(payloads[0].message).toContain("radix-ui");
  });

  it("stamps preview_success=false + category preview when host fails on persistent empty HTML body", async () => {
    // Host waitForReady now rejects empty <body> at the readiness deadline
    // (readinessState=failed) instead of accepting after ~5 polls. App-side
    // translation must stay on the existing failed → stamp false + error-log
    // path — never preview_success=true, no new UI surface.
    await applyPreviewReadinessOutcome({
      chatId: "chat_1",
      versionId: "v1",
      resumed: {
        readinessState: "failed",
        readinessError:
          "Runtime did not become ready within 600000ms. Last error: HTTP 200 HTML but body text still empty (compiling or blank page)",
        regeneratedLockfile: null,
        httpReady: false,
      },
    });

    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v1", false);
    expect(createEngineVersionErrorLogs).toHaveBeenCalledTimes(1);
    const [payloads] = createEngineVersionErrorLogs.mock.calls[0] as [
      Array<{ versionId: string; level: string; category: string; message: string }>,
    ];
    expect(payloads[0]).toMatchObject({
      versionId: "v1",
      level: "error",
      category: "preview",
    });
    expect(payloads[0].message).toMatch(/body text still empty/i);
  });

  it("stamps preview_success=true and never logs an error when ready", async () => {
    await applyPreviewReadinessOutcome({
      chatId: "chat_1",
      versionId: "v1",
      resumed: { readinessState: "ready", readinessError: null, regeneratedLockfile: null, httpReady: true },
    });
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v1", true);
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("binds the receipt to the revision captured by the preview session", async () => {
    await applyPreviewReadinessOutcome({
      chatId: "chat_1",
      versionId: "v1",
      bootedFilesRevision: "revision-booted",
      resumed: {
        readinessState: "ready",
        readinessError: null,
        regeneratedLockfile: null,
        httpReady: true,
      },
    });
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v1", true, {
      bootedFilesRevision: "revision-booted",
    });
  });

  it("does not stamp while starting", async () => {
    await applyPreviewReadinessOutcome({
      chatId: "chat_1",
      versionId: "v1",
      resumed: { readinessState: "starting", readinessError: null, regeneratedLockfile: null, httpReady: false },
    });
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });

  it("logs the build-error row only ONCE across repeated failed polls (Bugbot HIGH)", async () => {
    const failed = {
      readinessState: "failed" as const,
      readinessError: "Module not found: radix-ui",
      regeneratedLockfile: null,
      httpReady: false,
    };
    // Heartbeat (~25s) + preview-status (~15s) both re-stamp `failed` on every
    // poll; without the per-version guard each would INSERT a new error row.
    await applyPreviewReadinessOutcome({ chatId: "chat_1", versionId: "v1", resumed: failed });
    await applyPreviewReadinessOutcome({ chatId: "chat_1", versionId: "v1", resumed: failed });
    await applyPreviewReadinessOutcome({ chatId: "chat_1", versionId: "v1", resumed: failed });

    expect(createEngineVersionErrorLogs).toHaveBeenCalledTimes(1);
    // A DIFFERENT version still gets its own single row.
    await applyPreviewReadinessOutcome({ chatId: "chat_1", versionId: "v2", resumed: failed });
    expect(createEngineVersionErrorLogs).toHaveBeenCalledTimes(2);
  });

  it("does NOT stamp true on unknown readiness (null) — Bugbot finding 1", async () => {
    await applyPreviewReadinessOutcome({
      chatId: "chat_1",
      versionId: "v1",
      resumed: { readinessState: null, readinessError: null, regeneratedLockfile: null, httpReady: false },
    });
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });
});

describe("persistRegeneratedLockfileForVersion (regression 1 — lockfile round-trip)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetPersistedLockfileGuardForTesting();
  });

  it("writes the regenerated lockfile and drops the stale marker", async () => {
    getVersionFilesSnapshot.mockResolvedValueOnce(
      snapshotOf([
        { path: "package.json", content: "{}", language: "json" },
        { path: "pnpm-lock.yaml", content: "OLD", language: "yaml" },
        { path: LOCKFILE_STALE_MARKER_PATH, content: "{}", language: "json" },
      ]),
    );

    const wrote = await persistRegeneratedLockfileForVersion("v1", {
      path: "pnpm-lock.yaml",
      content: "NEW",
    });

    expect(wrote).toBe(true);
    expect(updateVersionFiles).toHaveBeenCalledTimes(1);
    const [, filesJson] = updateVersionFiles.mock.calls[0] as [string, string];
    const parsed = JSON.parse(filesJson) as Array<{ path: string; content: string }>;
    expect(parsed.find((f) => f.path === LOCKFILE_STALE_MARKER_PATH)).toBeUndefined();
    expect(parsed.find((f) => f.path === "pnpm-lock.yaml")?.content).toBe("NEW");
  });

  it("preserves the active previewUrl (does NOT null the live session) — Bugbot HIGH", async () => {
    getVersionFilesSnapshot.mockResolvedValueOnce(
      snapshotOf([
        { path: "package.json", content: "{}", language: "json" },
        { path: "pnpm-lock.yaml", content: "OLD", language: "yaml" },
        { path: LOCKFILE_STALE_MARKER_PATH, content: "{}", language: "json" },
      ]),
    );

    await persistRegeneratedLockfileForVersion("v1", {
      path: "pnpm-lock.yaml",
      content: "NEW",
    });

    // The lockfile write must not clear the cached tier-2 URL: the running VM
    // still serves the same site, so the builder must stay bound to it.
    const [, , options] = updateVersionFiles.mock.calls[0] as [
      string,
      string,
      { preservePreviewUrl?: boolean } | undefined,
    ];
    expect(options?.preservePreviewUrl).toBe(true);
  });

  it("skips (no churn) when the stale marker is already gone", async () => {
    getVersionFilesSnapshot.mockResolvedValueOnce(
      snapshotOf([
        { path: "package.json", content: "{}", language: "json" },
        { path: "pnpm-lock.yaml", content: "OK", language: "yaml" },
      ]),
    );

    const wrote = await persistRegeneratedLockfileForVersion("v1", {
      path: "pnpm-lock.yaml",
      content: "NEW",
    });

    expect(wrote).toBe(false);
    expect(updateVersionFiles).not.toHaveBeenCalled();
  });

  it("is guarded once per version per instance", async () => {
    getVersionFilesSnapshot.mockResolvedValue(
      snapshotOf([
        { path: "pnpm-lock.yaml", content: "OLD", language: "yaml" },
        { path: LOCKFILE_STALE_MARKER_PATH, content: "{}", language: "json" },
      ]),
    );

    await persistRegeneratedLockfileForVersion("v1", { path: "pnpm-lock.yaml", content: "NEW" });
    await persistRegeneratedLockfileForVersion("v1", { path: "pnpm-lock.yaml", content: "NEW" });
    expect(updateVersionFiles).toHaveBeenCalledTimes(1);
  });

  // Read-modify-write of the WHOLE file array: without a compare-and-swap a
  // repair or user edit landing between the read and the write is overwritten
  // wholesale, and the caller would still record the reconcile as done.
  it("binder skrivningen till exakt den bas den läste (CAS)", async () => {
    const files = [
      { path: "pnpm-lock.yaml", content: "OLD", language: "yaml" },
      { path: LOCKFILE_STALE_MARKER_PATH, content: "{}", language: "json" },
    ];
    const snapshot = snapshotOf(files);
    getVersionFilesSnapshot.mockResolvedValueOnce(snapshot);

    await persistRegeneratedLockfileForVersion("v1", { path: "pnpm-lock.yaml", content: "NEW" });

    const [, , options] = updateVersionFiles.mock.calls[0] as [
      string,
      string,
      { expectedFilesJson?: string } | undefined,
    ];
    expect(options?.expectedFilesJson).toBe(snapshot.filesJson);
  });

  it("markerar inte reconcilen som gjord när CAS missar — en senare poll får försöka igen", async () => {
    const snapshot = snapshotOf([
      { path: "pnpm-lock.yaml", content: "OLD", language: "yaml" },
      { path: LOCKFILE_STALE_MARKER_PATH, content: "{}", language: "json" },
    ]);
    getVersionFilesSnapshot.mockResolvedValue(snapshot);
    updateVersionFiles.mockResolvedValueOnce(false);

    const first = await persistRegeneratedLockfileForVersion("v1", {
      path: "pnpm-lock.yaml",
      content: "NEW",
    });
    expect(first).toBe(false);

    // Guard-fri: nästa poll ska försöka igen mot den nya basen.
    const second = await persistRegeneratedLockfileForVersion("v1", {
      path: "pnpm-lock.yaml",
      content: "NEW",
    });
    expect(second).toBe(true);
    expect(updateVersionFiles).toHaveBeenCalledTimes(2);
  });
});
