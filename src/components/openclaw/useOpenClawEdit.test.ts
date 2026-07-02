import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal store mock: the hook only needs these four fields.
const store = vi.hoisted(() => ({
  addMessage: vi.fn(),
  updateAssistantMessage: vi.fn(),
  setStreaming: vi.fn(),
  scopeKey: "scope-1",
}));

vi.mock("@/lib/openclaw/openclaw-store", () => ({
  useOpenClawStore: () => store,
}));

import {
  OPENCLAW_EDIT_APPLIED_EVENT,
  OPENCLAW_EDIT_STALE_EVENT,
  useOpenClawEdit,
} from "./useOpenClawEdit";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

function dispatchedEvents(spy: ReturnType<typeof vi.spyOn>): CustomEvent[] {
  return (spy.mock.calls as unknown[][])
    .map((call): Event => call[0] as Event)
    .filter((event): event is CustomEvent => event instanceof CustomEvent);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  store.addMessage.mockReset();
  store.updateAssistantMessage.mockReset();
  store.setStreaming.mockReset();
  store.scopeKey = "scope-1";
  window.__SITEMASKIN_CONTEXT = { chatId: "chat-1", activeVersionId: "ver-1" };
});

afterEach(() => {
  // Restore the window.dispatchEvent spy so its recorded calls don't leak into
  // the next test (vi.spyOn reuses the same underlying spy on a shared object).
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.__SITEMASKIN_CONTEXT;
});

describe("useOpenClawEdit", () => {
  it("(a) dispatches OPENCLAW_EDIT_APPLIED_EVENT with chatId + versionId on success", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        versionId: "ver-2",
        changedFiles: ["app/globals.css"],
        previewUrl: null,
      }),
    );
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const { result } = renderHook(() => useOpenClawEdit());
    await act(async () => {
      await result.current.sendEdit("gör färgen blå");
    });

    const applied = dispatchedEvents(dispatchSpy).find(
      (event) => event.type === OPENCLAW_EDIT_APPLIED_EVENT,
    );
    expect(applied).toBeDefined();
    expect(applied?.detail).toMatchObject({ chatId: "chat-1", versionId: "ver-2" });
  });

  it("(b) dispatches OPENCLAW_EDIT_STALE_EVENT with serverPreferredVersionId on 409", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { ok: false, error: "stale_base_version", serverPreferredVersionId: "ver-new" },
        409,
      ),
    );
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const { result } = renderHook(() => useOpenClawEdit());
    await act(async () => {
      await result.current.sendEdit("gör färgen blå");
    });

    const stale = dispatchedEvents(dispatchSpy).find(
      (event) => event.type === OPENCLAW_EDIT_STALE_EVENT,
    );
    expect(stale).toBeDefined();
    expect(stale?.detail).toMatchObject({
      chatId: "chat-1",
      serverPreferredVersionId: "ver-new",
    });
    // A stale response must NOT look like a successful apply.
    const applied = dispatchedEvents(dispatchSpy).find(
      (event) => event.type === OPENCLAW_EDIT_APPLIED_EVENT,
    );
    expect(applied).toBeUndefined();
  });

  it("(c) does NOT dispatch the applied event when ok:false without a versionId", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, reason: "ops_generation_failed", error: "gick inte" }, 422),
    );
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const { result } = renderHook(() => useOpenClawEdit());
    await act(async () => {
      await result.current.sendEdit("gör något omöjligt");
    });

    const applied = dispatchedEvents(dispatchSpy).find(
      (event) => event.type === OPENCLAW_EDIT_APPLIED_EVENT,
    );
    expect(applied).toBeUndefined();
  });
});
