import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postPreviewHeartbeat = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const postPreviewHibernate = vi.hoisted(() => vi.fn(async () => ({ ok: true, hibernated: true })));

vi.mock("@/lib/builder/preview-session/api", () => ({
  postPreviewHeartbeat,
  postPreviewHibernate,
}));

import { usePreviewHeartbeat } from "./usePreviewHeartbeat";

/** Default delay before a hidden tab asks the host to hibernate (10 min). */
const HIDDEN_DELAY_MS = 600_000;

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

function renderLivePreview() {
  return renderHook(() =>
    usePreviewHeartbeat({
      chatId: "chat_1",
      versionId: "v1",
      previewUrl: "https://preview.example.fly.dev/chat_1",
      activePreviewSessionId: "ps_shared",
      activePreviewLifecycleToken: "life-old",
      previewLifecycle: "live",
    }),
  );
}

describe("usePreviewHeartbeat hibernation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not hibernate on pagehide, so a reload finds the machine running (SM-163)", async () => {
    renderLivePreview();

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await vi.advanceTimersByTimeAsync(HIDDEN_DELAY_MS);
    });

    expect(postPreviewHibernate).not.toHaveBeenCalled();
  });

  it("hibernates a tab that stays hidden, carrying the rendered lifecycle token", async () => {
    renderLivePreview();

    await act(async () => {
      setVisibility("hidden");
      await vi.advanceTimersByTimeAsync(HIDDEN_DELAY_MS - 1);
    });
    expect(postPreviewHibernate).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(postPreviewHibernate).toHaveBeenCalledExactlyOnceWith({
      chatId: "chat_1",
      versionId: "v1",
      previewSessionId: "ps_shared",
      lifecycleToken: "life-old",
      keepalive: true,
    });
  });

  it("does not hibernate a tab that comes back before the delay", async () => {
    renderLivePreview();

    await act(async () => {
      setVisibility("hidden");
      await vi.advanceTimersByTimeAsync(HIDDEN_DELAY_MS / 2);
      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(HIDDEN_DELAY_MS);
    });

    expect(postPreviewHibernate).not.toHaveBeenCalled();
  });
});
