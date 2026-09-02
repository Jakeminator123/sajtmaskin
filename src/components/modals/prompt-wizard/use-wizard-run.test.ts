import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isStaleWizardRunResponse,
  useWizardRun,
  WIZARD_RUN_STORAGE_KEY,
} from "./use-wizard-run";

const SERVER_RUN_ID = "22222222-2222-4222-8222-222222222222";
const NEXT_RUN_ID = "33333333-3333-4333-8333-333333333333";

function startResponse(id: string) {
  return new Response(JSON.stringify({ success: true, wizardRunId: id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function completeResponse() {
  return new Response(JSON.stringify({ success: true, status: "completed" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function startCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((call) => call[0] === "/api/wizard/start");
}

describe("useWizardRun", () => {
  const fetchMock = vi.fn();
  let activeRunId = SERVER_RUN_ID;

  beforeEach(() => {
    activeRunId = SERVER_RUN_ID;
    fetchMock.mockReset();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/wizard/complete")) {
        return Promise.resolve(completeResponse());
      }
      return Promise.resolve(startResponse(activeRunId));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("asks the server for a run id and never invents a client UUID", async () => {
    const randomUUID = vi.spyOn(window.crypto, "randomUUID");

    const { result } = renderHook(() =>
      useWizardRun({ isOpen: true, isAuthenticated: true, isInitialized: true }),
    );

    await waitFor(() => expect(result.current.wizardRunId).toBe(SERVER_RUN_ID));
    expect(fetchMock).toHaveBeenCalledWith("/api/wizard/start", expect.objectContaining({
      method: "POST",
    }));
    expect(window.localStorage.getItem(WIZARD_RUN_STORAGE_KEY)).toBe(SERVER_RUN_ID);
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it("completes the server run instead of minting a replacement id", async () => {
    const { result } = renderHook(() =>
      useWizardRun({ isOpen: true, isAuthenticated: true, isInitialized: true }),
    );
    await waitFor(() => expect(result.current.wizardRunId).toBe(SERVER_RUN_ID));
    const startCallsBeforeComplete = startCalls(fetchMock).length;

    await act(async () => {
      await result.current.completeRun();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/wizard/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ wizardRunId: SERVER_RUN_ID }),
      }),
    );
    expect(result.current.wizardRunId).toBe("");
    expect(window.localStorage.getItem(WIZARD_RUN_STORAGE_KEY)).toBeNull();
    expect(startCalls(fetchMock)).toHaveLength(startCallsBeforeComplete);
  });

  it("does not start a new run when a stale 409 arrives during complete", async () => {
    const { result } = renderHook(() =>
      useWizardRun({ isOpen: true, isAuthenticated: true, isInitialized: true }),
    );
    await waitFor(() => expect(result.current.wizardRunId).toBe(SERVER_RUN_ID));
    const startCallsBeforeComplete = startCalls(fetchMock).length;

    await act(async () => {
      await result.current.completeRun();
    });
    await act(async () => {
      result.current.restartRun();
    });

    expect(result.current.wizardRunId).toBe("");
    expect(startCalls(fetchMock)).toHaveLength(startCallsBeforeComplete);
  });

  it("replaces an expired run with a new start and a new run id", async () => {
    const { result } = renderHook(() =>
      useWizardRun({ isOpen: true, isAuthenticated: true, isInitialized: true }),
    );
    await waitFor(() => expect(result.current.wizardRunId).toBe(SERVER_RUN_ID));
    const startCallsBeforeRestart = startCalls(fetchMock).length;
    activeRunId = NEXT_RUN_ID;

    await act(async () => {
      result.current.restartRun();
    });

    await waitFor(() => expect(result.current.wizardRunId).toBe(NEXT_RUN_ID));
    expect(startCalls(fetchMock).length).toBeGreaterThan(startCallsBeforeRestart);
    expect(window.localStorage.getItem(WIZARD_RUN_STORAGE_KEY)).toBe(NEXT_RUN_ID);
  });

  it("starts a new run after complete, close, and reopen", async () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useWizardRun({ isOpen, isAuthenticated: true, isInitialized: true }),
      { initialProps: { isOpen: true } },
    );
    await waitFor(() => expect(result.current.wizardRunId).toBe(SERVER_RUN_ID));
    const startCallsBeforeComplete = startCalls(fetchMock).length;

    await act(async () => {
      await result.current.completeRun();
    });
    expect(result.current.wizardRunId).toBe("");
    expect(startCalls(fetchMock)).toHaveLength(startCallsBeforeComplete);

    activeRunId = NEXT_RUN_ID;
    rerender({ isOpen: false });
    rerender({ isOpen: true });

    await waitFor(() => expect(result.current.wizardRunId).toBe(NEXT_RUN_ID));
    expect(startCalls(fetchMock).length).toBeGreaterThan(startCallsBeforeComplete);
  });

  it("calls start again on reopen even when a previous run id is still in state", async () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useWizardRun({ isOpen, isAuthenticated: true, isInitialized: true }),
      { initialProps: { isOpen: true } },
    );
    await waitFor(() => expect(result.current.wizardRunId).toBe(SERVER_RUN_ID));
    const startCallsBeforeClose = startCalls(fetchMock).length;

    rerender({ isOpen: false });
    activeRunId = NEXT_RUN_ID;
    rerender({ isOpen: true });

    await waitFor(() => expect(result.current.wizardRunId).toBe(NEXT_RUN_ID));
    expect(startCalls(fetchMock).length).toBeGreaterThan(startCallsBeforeClose);
  });
});

describe("isStaleWizardRunResponse", () => {
  it("treats wizard 409 as an expired or completed run", () => {
    expect(isStaleWizardRunResponse({ status: 409 })).toBe(true);
    expect(isStaleWizardRunResponse({ status: 403 })).toBe(false);
    expect(isStaleWizardRunResponse({ status: 200 })).toBe(false);
  });
});
