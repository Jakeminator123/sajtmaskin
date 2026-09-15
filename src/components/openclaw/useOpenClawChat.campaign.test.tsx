import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCampaignScriptStorageForTests,
  emptyCampaignScript,
  KOSTNADSFRI_ADVICE_EXHAUSTED_COPY,
  KOSTNADSFRI_ADVICE_ROUND_LIMIT,
} from "@/lib/kostnadsfri/agent-campaign-script";
import { useOpenClawChat } from "./useOpenClawChat";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";

beforeEach(() => {
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
  clearCampaignScriptStorageForTests();
  window.__SITEMASKIN_CONTEXT = { page: "kostnadsfri" };
  act(() => {
    useOpenClawStore.setState({
      messages: [],
      isStreaming: false,
      campaignScript: emptyCampaignScript("zax-2-0-ab"),
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.__SITEMASKIN_CONTEXT;
  clearCampaignScriptStorageForTests();
  act(() => {
    useOpenClawStore.setState({
      messages: [],
      isStreaming: false,
      campaignScript: null,
    });
  });
});

describe("useOpenClawChat — kampanjrådgivning", () => {
  it("räknar ned kvoten och stannar på noll utan ny modellturné", async () => {
    const { result } = renderHook(() => useOpenClawChat());

    for (let i = 0; i < KOSTNADSFRI_ADVICE_ROUND_LIMIT; i += 1) {
      await act(async () => {
        await result.current.send(`runda ${i + 1}`);
      });
    }

    expect(useOpenClawStore.getState().campaignScript?.remaining).toBe(0);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(KOSTNADSFRI_ADVICE_ROUND_LIMIT);

    await act(async () => {
      await result.current.send("en gång till");
    });

    expect(useOpenClawStore.getState().campaignScript?.remaining).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(KOSTNADSFRI_ADVICE_ROUND_LIMIT);
    expect(
      useOpenClawStore.getState().messages.some((message) => message.content === KOSTNADSFRI_ADVICE_EXHAUSTED_COPY),
    ).toBe(true);
    expect(KOSTNADSFRI_ADVICE_EXHAUSTED_COPY.toLowerCase()).not.toMatch(/generering|ombyggnad/);
  });
});
