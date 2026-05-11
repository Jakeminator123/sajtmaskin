import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreviewHeartbeat } from "./usePreviewHeartbeat";
import { postPreviewHeartbeat, postPreviewHibernate } from "@/lib/builder/preview-session/api";

vi.mock("@/lib/builder/preview-session/api", () => ({
  postPreviewHeartbeat: vi.fn(),
  postPreviewHibernate: vi.fn(),
}));

const TIER2_URL = "https://sajtmaskin-preview.fly.dev/chat_1";

describe("usePreviewHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(postPreviewHeartbeat).mockReset();
    vi.mocked(postPreviewHeartbeat).mockResolvedValue({ ok: true });
    vi.mocked(postPreviewHibernate).mockReset();
    vi.mocked(postPreviewHibernate).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses legacy activeSandboxId as previewSessionId for heartbeat", async () => {
    renderHook(() =>
      usePreviewHeartbeat({
        chatId: "chat_1",
        versionId: "ver_1",
        previewUrl: TIER2_URL,
        activeSandboxId: "sb_legacy",
        activePreviewSessionId: null,
        previewLifecycle: "live",
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });

    expect(postPreviewHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_1",
        previewSessionId: "sb_legacy",
      }),
    );
  });

  it("prefers activePreviewSessionId over legacy activeSandboxId", async () => {
    renderHook(() =>
      usePreviewHeartbeat({
        chatId: "chat_1",
        versionId: "ver_1",
        previewUrl: TIER2_URL,
        activeSandboxId: "sb_legacy",
        activePreviewSessionId: "sb_current",
        previewLifecycle: "live",
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });

    expect(postPreviewHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        previewSessionId: "sb_current",
      }),
    );
  });
});
