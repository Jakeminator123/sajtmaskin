import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPreviewHostBaseUrl = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/preview/tier2-config", () => ({
  getPreviewHostBaseUrl,
}));
vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  previewHostAuthHeaders: () => ({ Authorization: "Bearer test-key" }),
}));
vi.mock("@/lib/gen/preview/session-store", () => ({
  getActivePreviewSessionAsync,
}));

import {
  buildOpenClawPreviewLogBlock,
  OPENCLAW_PREVIEW_LOG_MAX_LINES,
} from "./preview-log-context";

const fetchMock = vi.fn();

function mockSession(overrides?: Record<string, unknown>) {
  getActivePreviewSessionAsync.mockResolvedValue({
    previewSessionId: "psid-123",
    previewUrl: "https://vm.example/p/psid-123",
    versionId: "v-42",
    createdAt: 1,
    lastUsedAt: 2,
    ...overrides,
  });
}

function mockLogsResponse(lines: unknown, ok = true) {
  fetchMock.mockResolvedValue({
    ok,
    json: async () => ({ previewSessionId: "psid-123", lines }),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  getPreviewHostBaseUrl.mockReturnValue("https://vm.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("buildOpenClawPreviewLogBlock", () => {
  it("returns null without an active preview session and never calls the host", async () => {
    getActivePreviewSessionAsync.mockResolvedValue(null);

    expect(await buildOpenClawPreviewLogBlock("chat-1")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when the preview-host is not configured", async () => {
    getPreviewHostBaseUrl.mockReturnValue("");
    mockSession();

    expect(await buildOpenClawPreviewLogBlock("chat-1")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds a bounded block with session meta and real log lines", async () => {
    mockSession();
    mockLogsResponse([
      { ts: "2026-07-31T20:00:00Z", message: "Session created for chat chat-1." },
      { ts: "2026-07-31T20:01:00Z", message: "Session patched (2 file(s), 0 removed)." },
    ]);

    const block = await buildOpenClawPreviewLogBlock("chat-1");

    expect(block).toContain("[PREVIEW-LOGG]");
    expect(block).toContain("session: psid-123 | version: v-42");
    expect(block).toContain("Session created for chat chat-1.");
    expect(block).toContain("Session patched (2 file(s), 0 removed).");
    expect(block?.endsWith("[/PREVIEW-LOGG]")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://vm.example/preview/logs/psid-123",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });

  it("warns when the session is pinned to another version than the reviewed one", async () => {
    mockSession({ versionId: "v-42" });
    mockLogsResponse([{ ts: "2026-07-31T20:00:00Z", message: "Session created." }]);

    const block = await buildOpenClawPreviewLogBlock("chat-1", {
      reviewedVersionId: "v-99",
    });

    expect(block).toContain("OBS: preview-sessionen är pinnad till version v-42");
    expect(block).toContain("INTE den granskade versionen v-99");
  });

  it("adds no warning when session and reviewed version match", async () => {
    mockSession({ versionId: "v-42" });
    mockLogsResponse([{ ts: "2026-07-31T20:00:00Z", message: "Session created." }]);

    const block = await buildOpenClawPreviewLogBlock("chat-1", {
      reviewedVersionId: "v-42",
    });

    expect(block).toContain("session: psid-123 | version: v-42");
    expect(block).not.toContain("OBS: preview-sessionen");
  });

  it("keeps only the newest lines when the log exceeds the cap", async () => {
    mockSession();
    const lines = Array.from({ length: OPENCLAW_PREVIEW_LOG_MAX_LINES + 20 }, (_, i) => ({
      ts: "2026-07-31T20:00:00Z",
      message: `line-${i}`,
    }));
    mockLogsResponse(lines);

    const block = await buildOpenClawPreviewLogBlock("chat-1");

    expect(block).toContain(`line-${OPENCLAW_PREVIEW_LOG_MAX_LINES + 19}`);
    expect(block).not.toContain("line-0\n");
    expect(block).toContain(
      `visar de ${OPENCLAW_PREVIEW_LOG_MAX_LINES} senaste av ${lines.length} rader`,
    );
  });

  it("fails soft on host errors, malformed payloads and empty logs", async () => {
    mockSession();
    mockLogsResponse([], true);
    expect(await buildOpenClawPreviewLogBlock("chat-1")).toBeNull();

    mockSession();
    mockLogsResponse("not-an-array" as unknown);
    expect(await buildOpenClawPreviewLogBlock("chat-1")).toBeNull();

    mockSession();
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await buildOpenClawPreviewLogBlock("chat-1")).toBeNull();

    mockSession();
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect(await buildOpenClawPreviewLogBlock("chat-1")).toBeNull();
  });
});
