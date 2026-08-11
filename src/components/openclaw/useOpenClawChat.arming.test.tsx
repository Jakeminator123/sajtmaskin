import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useOpenClawChat } from "./useOpenClawChat";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";

const ARMING_TEXT = "kör 5 follow-ups och buggranska sajten";

beforeEach(() => {
  // The gateway answer is irrelevant here — the arming decision happens before
  // the request. A 503 keeps `send` short and avoids a stream mock.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 503,
      body: null,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => "",
    })),
  );
  act(() => {
    useOpenClawStore.setState({
      // Both gates open: the env flag AND the user's granted power. Arming is
      // authorized only by their conjunction.
      editEnabled: true,
      powersOn: true,
      grantedPowers: ["armed_autonomy"],
      armedMandate: null,
      armedContinuation: null,
      messages: [],
      isStreaming: false,
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => {
    useOpenClawStore.setState({
      editEnabled: false,
      powersOn: false,
      grantedPowers: [],
      armedMandate: null,
      armedContinuation: null,
      messages: [],
      isStreaming: false,
    });
  });
});

describe("useOpenClawChat — arming consent", () => {
  it("ignores an arming directive on a machine-generated turn", async () => {
    const { result } = renderHook(() => useOpenClawChat());

    await act(async () => {
      await result.current.send(ARMING_TEXT, { allowArming: false });
    });

    expect(useOpenClawStore.getState().armedMandate).toBeNull();
  });

  it("still arms on the same text when the user types it", async () => {
    const { result } = renderHook(() => useOpenClawChat());

    await act(async () => {
      await result.current.send(ARMING_TEXT);
    });

    expect(useOpenClawStore.getState().armedMandate?.mode).toBe("followups");
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(5);
  });

  // The user-facing promise: with the button up, the exact same sentence that
  // arms above must do nothing at all.
  it("does not arm when the powers button is off, even with OC_EDIT on", async () => {
    act(() => {
      useOpenClawStore.setState({ powersOn: false });
    });
    const { result } = renderHook(() => useOpenClawChat());

    await act(async () => {
      await result.current.send(ARMING_TEXT);
    });

    expect(useOpenClawStore.getState().armedMandate).toBeNull();
  });

  it("does not arm when the button is pressed but armed autonomy is not ticked", async () => {
    act(() => {
      useOpenClawStore.setState({ powersOn: true, grantedPowers: ["quick_edit"] });
    });
    const { result } = renderHook(() => useOpenClawChat());

    await act(async () => {
      await result.current.send(ARMING_TEXT);
    });

    expect(useOpenClawStore.getState().armedMandate).toBeNull();
  });

  // The continuation loop holds `send` in a ref and calls it from a timer, so a
  // grant captured at render time could outlive the grant itself. Powers are
  // therefore read live at send time, exactly like `isStreaming`.
  it("reads powers live, so a send captured before a revoke carries none", async () => {
    const { result } = renderHook(() => useOpenClawChat());
    const capturedSend = result.current.send;

    act(() => {
      useOpenClawStore.setState({ powersOn: false });
    });

    await act(async () => {
      await capturedSend(ARMING_TEXT);
    });

    expect(useOpenClawStore.getState().armedMandate).toBeNull();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.powers).toEqual([]);
  });

  it("ignores a stop directive on a machine-generated turn", async () => {
    act(() => {
      useOpenClawStore.setState({
        armedMandate: {
          mode: "followups",
          remaining: 2,
          reason: "gör 2 follow-ups",
          createdAt: Date.now() - 1000,
        },
      });
    });
    const { result } = renderHook(() => useOpenClawChat());

    await act(async () => {
      await result.current.send("stoppa efter detta steg", { allowArming: false });
    });

    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(2);
  });

  it("uses the live streaming state, not the one captured at render", async () => {
    const { result } = renderHook(() => useOpenClawChat());
    // The continuation loop calls `send` from a timer; a stale closure would
    // drop the turn even though the store says OpenClaw is idle.
    act(() => {
      useOpenClawStore.setState({ isStreaming: true });
    });
    act(() => {
      useOpenClawStore.setState({ isStreaming: false });
    });

    await act(async () => {
      await result.current.send("[Automatisk fortsättning] läge?", { allowArming: false });
    });

    expect(useOpenClawStore.getState().messages.some((m) => m.role === "user")).toBe(true);
  });

  it("disarms when the user types stop", async () => {
    act(() => {
      useOpenClawStore.setState({
        armedMandate: {
          mode: "followups",
          remaining: 2,
          reason: "gör 2 follow-ups",
          createdAt: Date.now() - 1000,
        },
        armedContinuation: {
          chatId: "chat-1",
          versionIdAtSend: "ver-1",
          startedAt: Date.now(),
          messageCountAtSend: 4,
          sendSeq: 3,
          sendOutcome: "started",
          observedAt: Date.now() - 5000,
          observedStrong: true,
          resumedAt: null,
          quietSince: Date.now() - 5000,
        },
      });
    });
    const { result } = renderHook(() => useOpenClawChat());

    await act(async () => {
      await result.current.send("stopp");
    });

    const state = useOpenClawStore.getState();
    expect(state.armedMandate).toBeNull();
    // Disarming must also drop a pending continuation, or the loop would wake
    // OpenClaw again after the user said stop.
    expect(state.armedContinuation).toBeNull();
  });
});
