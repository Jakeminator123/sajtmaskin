import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenClawStore, type OpenClawMessage } from "./openclaw-store";
import {
  hydrateAgentHistory,
  persistAgentMessages,
  resetAgentHistoryForTests,
} from "./agent-history";

const fetchMock = vi.fn();

function message(id: string, content = id): OpenClawMessage {
  return { id, role: "assistant", content, timestamp: 1, kind: "chat" };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  resetAgentHistoryForTests();
  useOpenClawStore.setState({ messages: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persistAgentMessages", () => {
  it("räknar bara ett uttryckligt persisted:true som kvitto och släpper raderna annars", async () => {
    // Fail-soft-routen svarar 200 även när DB-skrivningen inte gick igenom.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ persisted: false, count: 1 }), { status: 200 }),
    );
    expect(await persistAgentMessages("chat_1", [message("a1")])).toBe(false);

    // Samma rad ska skickas igen vid nästa försök — och då lyckas.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ persisted: true, count: 1 }), { status: 200 }),
    );
    expect(await persistAgentMessages("chat_1", [message("a1")])).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Kvitterad rad skickas inte en tredje gång.
    expect(await persistAgentMessages("chat_1", [message("a1")])).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("hoppar över tomma platshållare och släpper raderna vid HTTP-fel", async () => {
    expect(await persistAgentMessages("chat_1", [message("empty", "   ")])).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    expect(await persistAgentMessages("chat_1", [message("b1")])).toBe(false);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ persisted: true, count: 1 }), { status: 200 }),
    );
    expect(await persistAgentMessages("chat_1", [message("b1")])).toBe(true);
  });
});

describe("hydrateAgentHistory", () => {
  it("fyller storen med hydrerade rader bara om chatten fortfarande är aktuell", async () => {
    // Ny Response per anrop — en body kan bara läsas en gång.
    fetchMock.mockImplementation(
      async () =>
        new Response(
        JSON.stringify({
          messages: [
            {
              id: "h1",
              role: "user",
              kind: "chat",
              content: "Hej",
              createdAt: "2026-10-21T10:00:00.000Z",
              meta: { anchorBuilderMessageId: "assistant-1", anchorBuilderMessageIndex: 2 },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    expect(await hydrateAgentHistory("chat_1", () => false)).toBe(0);
    expect(useOpenClawStore.getState().messages).toEqual([]);

    expect(await hydrateAgentHistory("chat_1", () => true)).toBe(1);
    const [row] = useOpenClawStore.getState().messages;
    expect(row).toMatchObject({
      id: "h1",
      hydrated: true,
      anchorBuilderMessageId: "assistant-1",
      anchorBuilderMessageIndex: 2,
    });
  });
});
