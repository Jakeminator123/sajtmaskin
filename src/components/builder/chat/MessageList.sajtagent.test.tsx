import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import { MessageList } from "./MessageList";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@streamdown/code", () => ({
  code: () => null,
}));

function builder(id: string, role: "user" | "assistant", content: string): ChatMessage {
  return { id, role, content };
}

function agent(
  id: string,
  role: "user" | "assistant",
  content: string,
  extra: Partial<OpenClawMessage> = {},
): OpenClawMessage {
  return { id, role, content, timestamp: Date.now(), kind: "chat", ...extra };
}

describe("MessageList — Sajtagenten i samma tidslinje", () => {
  it("renderar agentens rader efter sitt ankare, med etikett", () => {
    render(
      <MessageList
        chatId="chat_1"
        messages={[
          builder("u1", "user", "Bygg en sajt"),
          builder("a1", "assistant", "Klart."),
        ]}
        agentMessages={[
          agent("q1", "user", "Vad tycker du om startsidan?", { anchorBuilderMessageId: "a1" }),
          agent("r1", "assistant", "Startsidan är tydlig.", { anchorBuilderMessageId: "a1" }),
        ]}
      />,
    );

    const rows = screen.getAllByTestId("sajtagent-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("data-agent-role")).toBe("user");
    expect(screen.getByText("Till Sajtagenten")).toBeTruthy();
    expect(screen.getByText("Sajtagenten")).toBeTruthy();
    expect(screen.getByText("Startsidan är tydlig.")).toBeTruthy();

    // Ordning i DOM: builder u1, builder a1, agent q1, agent r1.
    const texts = Array.from(
      document.querySelectorAll("[data-role]"),
    ).map((el) => el.getAttribute("data-role"));
    expect(texts).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("visar interna väckningar som statusrad, aldrig som användarbubbla", () => {
    render(
      <MessageList
        chatId="chat_1"
        messages={[builder("a1", "assistant", "Klart.")]}
        agentMessages={[
          agent("w1", "user", "[Byggresultat] Builderturen är klar.", {
            kind: "internal",
            anchorBuilderMessageId: "a1",
          }),
          agent("w2", "assistant", "Hero-sektionen blev tydligare.", {
            anchorBuilderMessageId: "a1",
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("sajtagent-status-row").textContent).toContain(
      "Sajtagenten tittar på den nya versionen",
    );
    expect(screen.queryByText(/\[Byggresultat\]/)).toBeNull();
    expect(screen.getAllByTestId("sajtagent-row")).toHaveLength(1);
  });

  it("renderar en chatt som bara har agentrader", () => {
    render(
      <MessageList
        chatId="chat_1"
        messages={[]}
        agentMessages={[agent("q1", "user", "Hej!", { anchorBuilderMessageId: null })]}
      />,
    );
    expect(screen.queryByText("Inga meddelanden ännu")).toBeNull();
    expect(screen.getByText("Hej!")).toBeTruthy();
  });
});
