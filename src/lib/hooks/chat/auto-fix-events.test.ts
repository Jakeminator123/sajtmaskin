import { describe, expect, it, vi } from "vitest";

import {
  AUTO_FIX_EVENT_NAME,
  dispatchAutoFixEvent,
  readAutoFixEventPayload,
} from "./auto-fix-events";

describe("auto-fix-events", () => {
  it("dispatches the shared auto-fix event with payload detail", () => {
    const handler = vi.fn();
    window.addEventListener(AUTO_FIX_EVENT_NAME, handler as EventListener);

    dispatchAutoFixEvent({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["preview failed"],
      meta: { source: "unit-test" },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0] as Event;
    expect(readAutoFixEventPayload(event)).toEqual({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["preview failed"],
      meta: { source: "unit-test" },
    });

    window.removeEventListener(AUTO_FIX_EVENT_NAME, handler as EventListener);
  });

  it("returns null for malformed auto-fix events", () => {
    expect(readAutoFixEventPayload(new CustomEvent(AUTO_FIX_EVENT_NAME, { detail: {} }))).toBeNull();
  });
});
