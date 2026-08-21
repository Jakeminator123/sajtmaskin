import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openclaw/builder-target", () => ({
  readActiveBuilderChatId: () => "chat_1",
}));

import { useOpenClawStore } from "./openclaw-store";
import { persistOpenClawPowersForActiveChat } from "./persist-openclaw-powers";

describe("persistOpenClawPowersForActiveChat", () => {
  beforeEach(() => {
    useOpenClawStore.setState({
      powersOn: false,
      grantedPowers: [],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrar om från servern om revoke-POST misslyckas", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("method") || url.includes("/api/openclaw/powers")) {
        if (url.includes("chatId=")) {
          return {
            ok: true,
            json: async () => ({ powersOn: true, granted: ["live_review"] }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const ok = await persistOpenClawPowersForActiveChat();
    expect(ok).toBe(false);
    expect(useOpenClawStore.getState().powersOn).toBe(true);
    expect(useOpenClawStore.getState().grantedPowers).toEqual(["live_review"]);
  });
});
