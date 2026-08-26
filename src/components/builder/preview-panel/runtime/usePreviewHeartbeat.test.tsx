import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const postPreviewHeartbeat = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const postPreviewHibernate = vi.hoisted(() => vi.fn(async () => ({ ok: true, hibernated: true })));

vi.mock("@/lib/builder/preview-session/api", () => ({
  postPreviewHeartbeat,
  postPreviewHibernate,
}));

import { usePreviewHeartbeat } from "./usePreviewHeartbeat";

describe("usePreviewHeartbeat lifecycle fencing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("carries the rendered preview lifecycle token on pagehide hibernate", async () => {
    renderHook(() => usePreviewHeartbeat({
      chatId: "chat_1",
      versionId: "v1",
      previewUrl: "https://preview.example.fly.dev/chat_1",
      activePreviewSessionId: "ps_shared",
      activePreviewLifecycleToken: "life-old",
      previewLifecycle: "live",
    }));

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
    });

    expect(postPreviewHibernate).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "v1",
      previewSessionId: "ps_shared",
      lifecycleToken: "life-old",
      keepalive: true,
    });
  });
});
