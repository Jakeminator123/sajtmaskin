import { beforeEach, describe, expect, it, vi } from "vitest";

// M#qe1 + M#qe2 (bug-swarm batch): runQuickEdit must (a) hold the per-version
// lease on the BASE version around the minor-version persist so it cannot race
// a concurrent verify/repair job, (b) decline retryable (`base_busy`) when
// another job owns the lease, (c) degrade to the unlocked path on lease-infra
// errors, and (d) never swallow a failed previewUrl persist silently.

const acquireVersionLease = vi.hoisted(() => vi.fn());
const releaseVersionLease = vi.hoisted(() => vi.fn());
const addAssistantMessageAndCreateDraftVersion = vi.hoisted(() => vi.fn());
const updateVersionPreviewUrl = vi.hoisted(() => vi.fn());
const tryPatchPreviewSession = vi.hoisted(() => vi.fn());
const startPreviewSession = vi.hoisted(() => vi.fn());
const warnLog = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/chat-repository-pg", () => ({
  acquireVersionLease,
  releaseVersionLease,
  addAssistantMessageAndCreateDraftVersion,
  updateVersionPreviewUrl,
}));

vi.mock("@/lib/gen/preview/preview-session", () => ({
  tryPatchPreviewSession,
  startPreviewSession,
}));

vi.mock("@/lib/utils/debug", () => ({
  warnLog,
  debugLog: vi.fn(),
}));

import { runQuickEdit } from "./service";
import type { Version } from "@/lib/db/chat-repository-pg";

const baseVersion = {
  id: "ver_base",
  edit_kind: "generation",
  parent_version_id: null,
  lifecycle_stage: "design",
} as unknown as Version;

const baseFiles = [{ path: "app/page.tsx", content: "export default function P(){return <div>old</div>}", language: "tsx" as const }];

const ops = [
  {
    kind: "replace_text" as const,
    path: "app/page.tsx",
    find: "old",
    replace: "new",
  },
];

function runParams() {
  return {
    chatId: "chat_1",
    baseVersion,
    baseFiles,
    ops,
    appProjectId: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  acquireVersionLease.mockResolvedValue({ runId: "run_1" });
  releaseVersionLease.mockResolvedValue(undefined);
  addAssistantMessageAndCreateDraftVersion.mockResolvedValue({
    version: { id: "ver_new" },
    message: { id: "msg_new" },
  });
  updateVersionPreviewUrl.mockResolvedValue(true);
  tryPatchPreviewSession.mockResolvedValue({
    ok: true,
    previewUrl: "https://preview.example/chat_1",
    previewSessionId: "ps_1",
    patchMode: "patched",
  });
});

describe("runQuickEdit — base-version lease (M#qe1)", () => {
  it("acquires the lease on the base version before persisting and releases it after", async () => {
    const result = await runQuickEdit(runParams());
    expect(result.ok).toBe(true);
    expect(acquireVersionLease).toHaveBeenCalledWith("ver_base", "quick_edit");
    expect(releaseVersionLease).toHaveBeenCalledWith("ver_base", "run_1");
    expect(acquireVersionLease.mock.invocationCallOrder[0]).toBeLessThan(
      addAssistantMessageAndCreateDraftVersion.mock.invocationCallOrder[0],
    );
  });

  it("declines with retryable base_busy when another job owns the lease", async () => {
    acquireVersionLease.mockResolvedValue(null);
    const result = await runQuickEdit(runParams());
    expect(result).toMatchObject({ ok: false, reason: "base_busy" });
    expect(addAssistantMessageAndCreateDraftVersion).not.toHaveBeenCalled();
    expect(releaseVersionLease).not.toHaveBeenCalled();
  });

  it("degrades to the unlocked path when lease infra errors (missing table)", async () => {
    acquireVersionLease.mockRejectedValue(new Error("relation does not exist"));
    const result = await runQuickEdit(runParams());
    expect(result.ok).toBe(true);
    expect(addAssistantMessageAndCreateDraftVersion).toHaveBeenCalled();
    expect(releaseVersionLease).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalledWith(
      "engine",
      expect.stringContaining("lease acquire failed"),
      expect.objectContaining({ baseVersionId: "ver_base" }),
    );
  });

  it("releases the lease even when the persist throws", async () => {
    addAssistantMessageAndCreateDraftVersion.mockRejectedValue(new Error("db down"));
    await expect(runQuickEdit(runParams())).rejects.toThrow("db down");
    expect(releaseVersionLease).toHaveBeenCalledWith("ver_base", "run_1");
  });
});

describe("runQuickEdit — previewUrl persist logging (M#qe2)", () => {
  it("logs a warning when the previewUrl persist fails instead of swallowing", async () => {
    updateVersionPreviewUrl.mockRejectedValue(new Error("write timeout"));
    const result = await runQuickEdit(runParams());
    expect(result.ok).toBe(true);
    expect(warnLog).toHaveBeenCalledWith(
      "engine",
      expect.stringContaining("Failed to persist previewUrl"),
      expect.objectContaining({ versionId: "ver_new", error: "write timeout" }),
    );
  });
});
