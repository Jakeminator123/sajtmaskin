import { describe, expect, it, vi } from "vitest";

import {
  QUICK_EDIT_APPLIED_EVENT_NAME,
  dispatchQuickEditAppliedEvent,
  readQuickEditAppliedEventPayload,
} from "./quick-edit-applied-event";

describe("quick-edit-applied-event", () => {
  it("dispatches the shared event with payload detail", () => {
    const handler = vi.fn();
    window.addEventListener(QUICK_EDIT_APPLIED_EVENT_NAME, handler as EventListener);

    dispatchQuickEditAppliedEvent({
      chatId: "chat_1",
      versionId: "ver_2",
      previewUrl: "https://vm.example/p/abc",
      previewSessionId: "psid_1",
      previewMode: "dev_only",
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0] as Event;
    expect(readQuickEditAppliedEventPayload(event)).toEqual({
      chatId: "chat_1",
      versionId: "ver_2",
      previewUrl: "https://vm.example/p/abc",
      previewSessionId: "psid_1",
      previewMode: "dev_only",
    });

    window.removeEventListener(QUICK_EDIT_APPLIED_EVENT_NAME, handler as EventListener);
  });

  it("returns null for malformed events", () => {
    expect(
      readQuickEditAppliedEventPayload(
        new CustomEvent(QUICK_EDIT_APPLIED_EVENT_NAME, { detail: {} }),
      ),
    ).toBeNull();
    expect(
      readQuickEditAppliedEventPayload(
        new CustomEvent(QUICK_EDIT_APPLIED_EVENT_NAME, { detail: { chatId: "c" } }),
      ),
    ).toBeNull();
  });
});
