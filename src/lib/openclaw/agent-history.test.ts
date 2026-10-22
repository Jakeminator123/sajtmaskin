import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenClawStore, type OpenClawMessage } from "./openclaw-store";
import {
  AGENT_MESSAGES_MAX_PER_POST,
  AGENT_MESSAGE_MAX_CONTENT_CHARS,
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

  it("tar med släppta rader när anroparen lämnar hela storen nästa tur", async () => {
    const store: OpenClawMessage[] = [message("u1"), message("a1")];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ persisted: false, count: 2 }), { status: 200 }),
    );
    expect(await persistAgentMessages("chat_1", store)).toBe(false);

    // Nästa tur: storen har växt, och de två gamla raderna följer med igen.
    store.push(message("u2"), message("a2"));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ persisted: true, count: 4 }), { status: 200 }),
    );
    expect(await persistAgentMessages("chat_1", store)).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      messages: Array<{ id: string }>;
    };
    expect(body.messages.map((row) => row.id)).toEqual(["u1", "a1", "u2", "a2"]);
  });

  it("delar upp i routens batchstorlek, hoppar över hydrerade rader och klipper för långt innehåll", async () => {
    const rows: OpenClawMessage[] = [];
    for (let i = 0; i < AGENT_MESSAGES_MAX_PER_POST + 5; i += 1) rows.push(message(`m${i}`));
    rows.push({ ...message("hydrated"), hydrated: true });
    rows.push(message("long", "x".repeat(AGENT_MESSAGE_MAX_CONTENT_CHARS + 50)));
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ persisted: true, count: 1 }), { status: 200 }),
    );
    expect(await persistAgentMessages("chat_1", rows)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(
      (call) =>
        JSON.parse(String(call[1]?.body)) as {
          messages: Array<{ id: string; content: string }>;
        },
    );
    expect(bodies[0].messages).toHaveLength(AGENT_MESSAGES_MAX_PER_POST);
    expect(bodies[1].messages.map((row) => row.id)).toEqual([
      "m20",
      "m21",
      "m22",
      "m23",
      "m24",
      "long",
    ]);
    const long = bodies[1].messages.find((row) => row.id === "long");
    expect(long?.content.length).toBe(AGENT_MESSAGE_MAX_CONTENT_CHARS);
    expect(long?.content.endsWith("…")).toBe(true);
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
