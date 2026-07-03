import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import { buildF3AwaitingInputUiPart } from "@/lib/gen/stream/f3-continuation";
import { MessageList } from "./MessageList";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@streamdown/code", () => ({
  code: () => null,
}));

describe("MessageList", () => {
  it("renders suggestIntegration approvals inline in compact mode without opening reply dialog", async () => {
    // Ägarbeslut 2026-07-03: integrations-/env-frågor ska stanna inline
    // i chatten (compact cards) och inte driva plan-dialogen.
    const messages: ChatMessage[] = [
      {
        id: "assistant_inline_1",
        role: "assistant",
        content: "Här är nästa steg för integrationen.",
        uiParts: [
          {
            type: "tool:integration-suggestion",
            toolName: "Integration suggestion",
            toolCallId: "integration:stripe",
            state: "approval-requested",
            output: {
              question: "Vill du konfigurera Stripe nu?",
              options: ["Godkänn förslag", "Avvisa förslag"],
              provider: "stripe",
              name: "Stripe",
              envVars: ["STRIPE_SECRET_KEY"],
            },
          },
        ],
      },
    ];

    render(<MessageList chatId="chat_inline_1" messages={messages} />);

    await waitFor(() => {
      expect(screen.getByText("Vill du konfigurera Stripe nu?")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Godkänn förslag" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Avvisa förslag" })).toBeTruthy();
    expect(screen.queryByText("Svar krävs för att fortsätta")).toBeNull();
  });

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
      expect(screen.getByText("Svar krävs för att fortsätta")).toBeTruthy();
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

  it("keeps the F3 awaiting-input quick-replies after reload from the persisted marker (Bugbot MEDIUM PR #382)", async () => {
    // Reload scenario: the message list is rebuilt from persisted
    // engine_messages.ui_parts (no live stream state). The old marker
    // toolName ("Integrationsbygge…") matched `isIntegrationOrEnvToolPart`
    // and suppressed `getLatestPendingReply` — the reply dialog never opened
    // and the Godkänn/Avvisa quick-replies disappeared.
    const onQuickReply = vi.fn(async () => {});
    const messages: ChatMessage[] = [
      {
        id: "user_f3_kick",
        role: "user",
        content: "Bygg integrationer nu utifrån den finaliserade designversionen.",
      },
      {
        id: "assistant_f3_marker",
        role: "assistant",
        content: "Integrationer signalerades, men modellen skrev inga kodfiler.",
        uiParts: [
          buildF3AwaitingInputUiPart({
            question:
              "Integrationer signalerades, men modellen skrev inga kodfiler. Välj om du vill köra integrationsbygget igen eller fortsätta med designversionen.",
            parentVersionId: "ver_f2_parent",
          }),
        ],
      },
    ];

    render(
      <MessageList chatId="chat_f3" messages={messages} onQuickReply={onQuickReply} />,
    );

    // The pendingReply-driven dialog must detect the marker…
    await waitFor(() => {
      expect(screen.getByText("Svar krävs för att fortsätta")).toBeTruthy();
    });

    // …and surface the canonical quick-replies.
    const approveButton = screen.getByRole("button", { name: "Godkänn förslag" });
    expect(screen.getByRole("button", { name: "Avvisa förslag" })).toBeTruthy();

    fireEvent.click(approveButton);
    await waitFor(() => {
      expect(onQuickReply).toHaveBeenCalledWith("Godkänn förslag", { planMode: false });
    });
  });
});
