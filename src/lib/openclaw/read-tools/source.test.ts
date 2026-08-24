import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLACEHOLDER_API_ROUTE } from "@/lib/gen/export/project-scaffold";

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  getLatest: vi.fn(),
  getDiagnostics: vi.fn(),
  getSession: vi.fn(),
  getManifest: vi.fn(),
  getBaseUrl: vi.fn(),
  authHeaders: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest: mocks.getById,
  getLatestEngineVersionForChatForRequest: mocks.getLatest,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  getLatestEngineVersionErrorLogs: mocks.getDiagnostics,
}));

vi.mock("@/lib/gen/preview/session-store", () => ({
  peekActivePreviewSessionAsync: mocks.getSession,
  PREVIEW_SESSION_HARD_CAP_MS: 60_000,
  PREVIEW_SESSION_IDLE_MS: 30_000,
}));

vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  fetchPreviewHostFilesManifest: mocks.getManifest,
  previewHostAuthHeaders: mocks.authHeaders,
}));

vi.mock("@/lib/gen/preview/tier2-config", () => ({
  getPreviewHostBaseUrl: mocks.getBaseUrl,
}));

import { defaultOpenClawReadToolDataSource } from "./source";
import { OPENCLAW_READ_MAX_LANGUAGE_CHARS, OPENCLAW_READ_MAX_RAW_SNAPSHOT_CHARS } from "./policy";

const request = new Request("https://sajtmaskin.test/api/openclaw");

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function validHostFiles(): Record<string, string> {
  return {
    "app/page.tsx": sha256("export default function Page() {}"),
    "app/api/placeholder/route.ts": sha256(PLACEHOLDER_API_ROUTE),
    ".env.local": sha256("server-owned-preview-env"),
  };
}

function ownedVersion(overrides?: Record<string, unknown>) {
  return {
    id: "version-owned",
    chat_id: "chat-owned",
    message_id: null,
    version_number: 7,
    files_json: JSON.stringify([
      { path: "app/page.tsx", language: "tsx", content: "export default function Page() {}" },
    ]),
    files_revision: "revision-owned",
    repaired_files_json: null,
    preview_url: "https://must-not-be-returned.example",
    release_state: "draft",
    verification_state: "pending",
    verification_summary: null,
    repair_available_at: null,
    promoted_at: null,
    lifecycle_stage: "design",
    parent_version_id: null,
    edit_kind: null,
    created_at: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

async function loadTarget() {
  const loaded = await defaultOpenClawReadToolDataSource.loadTarget({
    request,
    chatId: "chat-owned",
    versionId: "version-owned",
    sessionId: "browser-session",
  });
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) throw new Error("expected owned target");
  return loaded.target;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getById.mockResolvedValue({ chat: {}, version: ownedVersion() });
  mocks.getLatest.mockResolvedValue({ chat: {}, version: ownedVersion() });
  mocks.getDiagnostics.mockResolvedValue([]);
  mocks.getSession.mockResolvedValue(null);
  mocks.getManifest.mockResolvedValue(null);
  mocks.getBaseUrl.mockReturnValue("https://preview-host.internal");
  mocks.authHeaders.mockReturnValue({ authorization: "Bearer internal-secret" });
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("production OpenClaw read-tool source", () => {
  it("uses the tenant-scoped exact chat/version lookup and same-row revision", async () => {
    const target = await loadTarget();
    expect(mocks.getById).toHaveBeenCalledWith(request, "chat-owned", "version-owned", {
      sessionId: "browser-session",
    });
    expect(mocks.getLatest).not.toHaveBeenCalled();
    expect(target.chatId).toBe("chat-owned");
    expect(target.metadata.versionId).toBe("version-owned");
    expect(target.metadata.filesRevision).toBe("revision-owned");
    expect(target.metadata).not.toHaveProperty("previewUrl");
  });

  it("collapses cross-tenant, missing-chat and mismatched-version outcomes to unavailable", async () => {
    mocks.getById.mockResolvedValue(null);
    const result = await defaultOpenClawReadToolDataSource.loadTarget({
      request,
      chatId: "chat-attacker-requested",
      versionId: "version-victim",
    });
    expect(result).toEqual({ ok: false, code: "target_unavailable" });
  });

  it("fails closed on missing revisions, duplicate paths and oversized project snapshots", async () => {
    mocks.getById.mockResolvedValueOnce({
      chat: {},
      version: ownedVersion({ files_revision: null }),
    });
    expect(
      await defaultOpenClawReadToolDataSource.loadTarget({
        request,
        chatId: "chat-owned",
        versionId: "version-owned",
      }),
    ).toEqual({ ok: false, code: "revision_unavailable" });

    mocks.getById.mockResolvedValueOnce({
      chat: {},
      version: ownedVersion({
        files_json: JSON.stringify([
          { path: "src/a.ts", language: "ts", content: "a" },
          { path: "src\\a.ts", language: "ts", content: "b" },
        ]),
      }),
    });
    expect(
      await defaultOpenClawReadToolDataSource.loadTarget({
        request,
        chatId: "chat-owned",
        versionId: "version-owned",
      }),
    ).toEqual({ ok: false, code: "snapshot_invalid" });

    mocks.getById.mockResolvedValueOnce({
      chat: {},
      version: ownedVersion({
        files_json: JSON.stringify([
          { path: "src/huge.ts", language: "ts", content: "x".repeat(12_000_001) },
        ]),
      }),
    });
    expect(
      await defaultOpenClawReadToolDataSource.loadTarget({
        request,
        chatId: "chat-owned",
        versionId: "version-owned",
      }),
    ).toEqual({ ok: false, code: "project_too_large" });

    mocks.getById.mockResolvedValueOnce({
      chat: {},
      version: ownedVersion({
        files_json: " ".repeat(OPENCLAW_READ_MAX_RAW_SNAPSHOT_CHARS + 1),
      }),
    });
    expect(
      await defaultOpenClawReadToolDataSource.loadTarget({
        request,
        chatId: "chat-owned",
        versionId: "version-owned",
      }),
    ).toEqual({ ok: false, code: "project_too_large" });

    mocks.getById.mockResolvedValueOnce({
      chat: {},
      version: ownedVersion({
        files_json: JSON.stringify([
          {
            path: "src/metadata.ts",
            language: "x".repeat(OPENCLAW_READ_MAX_LANGUAGE_CHARS + 1),
            content: "safe",
          },
        ]),
      }),
    });
    expect(
      await defaultOpenClawReadToolDataSource.loadTarget({
        request,
        chatId: "chat-owned",
        versionId: "version-owned",
      }),
    ).toEqual({ ok: false, code: "project_too_large" });
  });

  it("never contacts the preview host when version or revision binding mismatches", async () => {
    const target = await loadTarget();
    mocks.getSession.mockResolvedValue({
      previewSessionId: "preview-secret-id",
      previewUrl: "https://preview-secret.internal",
      versionId: "other-version",
      filesRevision: "revision-owned",
      createdAt: 1_000,
      lastUsedAt: 1_500,
    });
    const versionMismatch = await defaultOpenClawReadToolDataSource.loadPreviewStatus(target);
    expect(versionMismatch.status).toBe("version_mismatch");
    expect(mocks.getManifest).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValue({
      previewSessionId: "preview-secret-id",
      previewUrl: "https://preview-secret.internal",
      versionId: "version-owned",
      filesRevision: "other-revision",
      createdAt: 1_000,
      lastUsedAt: 1_500,
    });
    const revisionMismatch = await defaultOpenClawReadToolDataSource.loadPreviewLogs(target, 20);
    expect(revisionMismatch.reason).toBe("revision_mismatch");
    expect(mocks.getBaseUrl).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns only passive preview state and omits host/session identifiers", async () => {
    const target = await loadTarget();
    mocks.getSession.mockResolvedValue({
      previewSessionId: "preview-secret-id",
      previewUrl: "https://preview-secret.internal",
      versionId: "version-owned",
      filesRevision: "revision-owned",
      createdAt: 1_000,
      lastUsedAt: 1_500,
    });
    mocks.getManifest.mockResolvedValue({
      previewSessionId: "preview-secret-id",
      versionId: "version-owned",
      running: true,
      files: validHostFiles(),
    });
    const status = await defaultOpenClawReadToolDataSource.loadPreviewStatus(target);
    expect(status).toMatchObject({
      status: "running",
      source: "files_manifest",
      hostRevisionMatches: true,
      readiness: "not_available_without_side_effects",
    });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("preview-secret-id");
    expect(serialized).not.toContain("preview-secret.internal");
  });

  it("rejects a host manifest for a different preview session", async () => {
    const target = await loadTarget();
    mocks.getSession.mockResolvedValue({
      previewSessionId: "preview-bound-id",
      previewUrl: "https://preview-secret.internal",
      versionId: "version-owned",
      filesRevision: "revision-owned",
      createdAt: 1_000,
      lastUsedAt: 1_500,
    });
    mocks.getManifest.mockResolvedValue({
      previewSessionId: "preview-other-id",
      versionId: "version-owned",
      running: true,
      files: {},
    });
    const status = await defaultOpenClawReadToolDataSource.loadPreviewStatus(target);
    expect(status).toMatchObject({
      status: "unknown",
      source: "files_manifest",
      hostVersionMatches: null,
    });
  });

  it.each([
    ["changed content", { ...validHostFiles(), "app/page.tsx": sha256("stale page") }],
    [
      "missing file",
      Object.fromEntries(
        Object.entries(validHostFiles()).filter(([path]) => path !== "app/page.tsx"),
      ),
    ],
    ["unexpected extra file", { ...validHostFiles(), "src/stale.ts": sha256("stale") }],
  ])("reports host revision mismatch for %s", async (_case, files) => {
    const target = await loadTarget();
    mocks.getSession.mockResolvedValue({
      previewSessionId: "preview-bound-id",
      previewUrl: "https://preview-secret.internal",
      versionId: "version-owned",
      filesRevision: "revision-owned",
      createdAt: 1_000,
      lastUsedAt: 1_500,
    });
    mocks.getManifest.mockResolvedValue({
      previewSessionId: "preview-bound-id",
      versionId: "version-owned",
      running: true,
      files,
    });
    const status = await defaultOpenClawReadToolDataSource.loadPreviewStatus(target);
    expect(status).toMatchObject({
      status: "revision_mismatch",
      source: "files_manifest",
      hostVersionMatches: true,
      hostRevisionMatches: false,
    });
  });
});
