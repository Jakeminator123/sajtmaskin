import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWizardRun, WIZARD_RUN_STORAGE_KEY } from "./use-wizard-run";

const SERVER_RUN_ID = "22222222-2222-4222-8222-222222222222";

describe("useWizardRun", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("asks the server for a run id and never invents a client UUID", async () => {
    const randomUUID = vi.spyOn(window.crypto, "randomUUID");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, wizardRunId: SERVER_RUN_ID }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

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
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, wizardRunId: SERVER_RUN_ID }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, status: "completed" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const { result } = renderHook(() =>
      useWizardRun({ isOpen: true, isAuthenticated: true, isInitialized: true }),
    );
    await waitFor(() => expect(result.current.wizardRunId).toBe(SERVER_RUN_ID));

    await act(async () => {
      await result.current.completeRun();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/wizard/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ wizardRunId: SERVER_RUN_ID }),
      }),
    );
    expect(result.current.wizardRunId).toBe("");
    expect(window.localStorage.getItem(WIZARD_RUN_STORAGE_KEY)).toBeNull();
  });
});
