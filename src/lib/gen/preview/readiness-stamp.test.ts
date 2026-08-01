import { beforeEach, describe, expect, it, vi } from "vitest";

const recordPreviewRuntimeOutcomeForVersion = vi.hoisted(() =>
  vi.fn<(versionId: string, previewSuccess: boolean) => Promise<void>>(async () => undefined),
);
const createEngineVersionErrorLogs = vi.hoisted(() =>
  vi.fn<(payloads: unknown[], opts?: unknown) => Promise<unknown[]>>(async () => []),
);
const getVersionFiles = vi.hoisted(() =>
  vi.fn<(versionId: string) => Promise<Array<{ path: string; content: string; language?: string }> | null>>(
    async () => null,
  ),
);
const updateVersionFiles = vi.hoisted(() =>
  vi.fn<(versionId: string, filesJson: string) => Promise<boolean>>(async () => true),
);

vi.mock("@/lib/db/services/generation-telemetry", () => ({
  recordPreviewRuntimeOutcomeForVersion,
}));
vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
}));
vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
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
    expect(decidePreviewReadinessOutcome({ readinessState: "ready", readinessError: null, regeneratedLockfile: null }))
      .toMatchObject({ previewSuccess: true, buildError: null });
  });

  it("keeps legacy 'running = ready' contract when readinessState is null", () => {
    expect(decidePreviewReadinessOutcome({ readinessState: null, readinessError: null, regeneratedLockfile: null }))
      .toMatchObject({ previewSuccess: true });
  });

  it("leaves telemetry untouched while still starting", () => {
    expect(decidePreviewReadinessOutcome({ readinessState: "starting", readinessError: null, regeneratedLockfile: null }))
      .toMatchObject({ previewSuccess: null, buildError: null });
  });

  it("stamps false + surfaces a build error when readiness failed", () => {
    const decision = decidePreviewReadinessOutcome({
      readinessState: "failed",
      readinessError: "Module not found: radix-ui",
      regeneratedLockfile: null,
    });
    expect(decision.previewSuccess).toBe(false);
    expect(decision.buildError).toContain("radix-ui");
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

  it("stamps preview_success=true and never logs an error when ready", async () => {
    await applyPreviewReadinessOutcome({
      chatId: "chat_1",
      versionId: "v1",
      resumed: { readinessState: "ready", readinessError: null, regeneratedLockfile: null },
    });
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v1", true);
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("does not stamp while starting", async () => {
    await applyPreviewReadinessOutcome({
      chatId: "chat_1",
      versionId: "v1",
      resumed: { readinessState: "starting", readinessError: null, regeneratedLockfile: null },
    });
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });
});

describe("persistRegeneratedLockfileForVersion (regression 1 — lockfile round-trip)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetPersistedLockfileGuardForTesting();
  });

  it("writes the regenerated lockfile and drops the stale marker", async () => {
    getVersionFiles.mockResolvedValueOnce([
      { path: "package.json", content: "{}", language: "json" },
      { path: "pnpm-lock.yaml", content: "OLD", language: "yaml" },
      { path: LOCKFILE_STALE_MARKER_PATH, content: "{}", language: "json" },
    ]);

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

  it("skips (no churn) when the stale marker is already gone", async () => {
    getVersionFiles.mockResolvedValueOnce([
      { path: "package.json", content: "{}", language: "json" },
      { path: "pnpm-lock.yaml", content: "OK", language: "yaml" },
    ]);

    const wrote = await persistRegeneratedLockfileForVersion("v1", {
      path: "pnpm-lock.yaml",
      content: "NEW",
    });

    expect(wrote).toBe(false);
    expect(updateVersionFiles).not.toHaveBeenCalled();
  });

  it("is guarded once per version per instance", async () => {
    getVersionFiles.mockResolvedValue([
      { path: "pnpm-lock.yaml", content: "OLD", language: "yaml" },
      { path: LOCKFILE_STALE_MARKER_PATH, content: "{}", language: "json" },
    ]);

    await persistRegeneratedLockfileForVersion("v1", { path: "pnpm-lock.yaml", content: "NEW" });
    await persistRegeneratedLockfileForVersion("v1", { path: "pnpm-lock.yaml", content: "NEW" });
    expect(updateVersionFiles).toHaveBeenCalledTimes(1);
  });
});
