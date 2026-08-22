import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const activeChat = { id: "chat_1" };

vi.mock("@/lib/openclaw/builder-target", () => ({
  readActiveBuilderChatId: () => activeChat.id,
}));

import { useOpenClawStore } from "./openclaw-store";
import {
  hydrateOpenClawPowersForChat,
  persistOpenClawPowersForActiveChat,
} from "./persist-openclaw-powers";

describe("persistOpenClawPowersForActiveChat", () => {
  beforeEach(() => {
    activeChat.id = "chat_1";
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

  it("skriver den senaste granten när två togglar överlappar", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const posts: Array<{ granted: unknown; powersOn: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          granted: unknown;
          powersOn: unknown;
        };
        posts.push(body);
        if (posts.length === 1) await firstGate;
        return { ok: true, json: async () => body };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    useOpenClawStore.setState({ powersOn: true, grantedPowers: ["live_review"] });
    const first = persistOpenClawPowersForActiveChat();
    useOpenClawStore.setState({ powersOn: false, grantedPowers: [] });
    const second = persistOpenClawPowersForActiveChat();
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(posts.at(-1)).toEqual({
      chatId: "chat_1",
      powersOn: false,
      granted: [],
    });
  });

  it("applicerar inte GET-hydratisering för en chatt som inte längre är aktiv", async () => {
    let releaseGet: (() => void) | undefined;
    const getGate = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("chatId=chat_1")) {
        await getGate;
        return {
          ok: true,
          json: async () => ({ powersOn: true, granted: ["live_review"] }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    useOpenClawStore.setState({ powersOn: false, grantedPowers: [] });
    const hydrate = hydrateOpenClawPowersForChat("chat_1");
    activeChat.id = "chat_2";
    releaseGet?.();
    await hydrate;

    expect(useOpenClawStore.getState().powersOn).toBe(false);
    expect(useOpenClawStore.getState().grantedPowers).toEqual([]);
  });
});
