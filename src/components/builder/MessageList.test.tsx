import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import { MessageList } from "./MessageList";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@streamdown/code", () => ({
  code: () => null,
}));

describe("MessageList", () => {
  it("shows the actual awaiting-input question without synthetic approval buttons", async () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant_1",
        role: "assistant",
        content: "Jag behöver mer information innan jag kan fortsätta.",
        uiParts: [
          {
            type: "tool:awaiting-input",
            toolName: "Klargörande fråga",
            toolCallId: "awaiting-input:assistant_1",
            state: "input-available",
            output: {
              question: "Vad vill du att jag fokuserar på i nästa ändring?",
              awaitingInput: true,
            },
          },
        ],
      },
    ];

    render(<MessageList chatId="chat_1" messages={messages} />);

    await waitFor(() => {
      expect(screen.getByText("AI behöver ditt val")).toBeTruthy();
    });

    expect(
      screen.getByText("Vad vill du att jag fokuserar på i nästa ändring?"),
    ).toBeTruthy();
    expect(
      screen.getByText("Svara i chatten för att fortsätta genereringen."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn förslag" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Avvisa förslag" })).toBeNull();
  });

  it("sends the selected quick reply from the awaiting-input dialog", async () => {
    const onQuickReply = vi.fn(async () => {});
    const messages: ChatMessage[] = [
      {
        id: "assistant_2",
        role: "assistant",
        content: "Jag behöver mer information innan jag kan fortsätta.",
        uiParts: [
          {
            type: "tool:awaiting-input",
            toolName: "Klargörande fråga",
            toolCallId: "awaiting-input:assistant_2",
            state: "input-available",
            output: {
              question: "Vad vill du att jag fokuserar på i nästa ändring?",
              options: ["Design", "Innehåll"],
              awaitingInput: true,
            },
          },
        ],
      },
    ];

    render(
      <MessageList chatId="chat_1" messages={messages} onQuickReply={onQuickReply} />,
    );

    const designButton = await screen.findByRole("button", { name: "Design" });
    fireEvent.click(designButton);

    await waitFor(() => {
      expect(onQuickReply).toHaveBeenCalledWith("Design", { planMode: false });
    });
  });
});
