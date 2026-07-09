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

  it("shows F3 reload quick-replies INLINE (no dialog, no auto-fire) for an old persisted marker", async () => {
    // Pin change (auto-resolve-f3-popup wave 1): the owner never wants the
    // "Svar krävs"-dialog for the F3-continuation marker. A marker present at
    // MOUNT is reloaded history — it must NOT auto-approve; instead the
    // canonical quick-replies render inline so the user can still choose.
    // (Previously this asserted the dialog opened; that behaviour is now gone.)
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

    // Inline quick-replies surface (no dialog).
    const approveButton = await screen.findByRole("button", { name: "Godkänn förslag" });
    expect(screen.getByRole("button", { name: "Avvisa förslag" })).toBeTruthy();
    // The dialog must NOT open for the F3-continuation kind.
    expect(screen.queryByText("Svar krävs för att fortsätta")).toBeNull();
    // A reloaded marker is NOT auto-approved.
    expect(onQuickReply).not.toHaveBeenCalled();

    fireEvent.click(approveButton);
    await waitFor(() => {
      expect(onQuickReply).toHaveBeenCalledWith("Godkänn förslag", { planMode: false });
    });
  });

  it("auto-approves a LIVE F3-continuation marker without a dialog (calm inline row)", async () => {
    // Live scenario: the marker arrives mid-session (its key was not present at
    // mount), so it auto-continues exactly once — no popup, just a calm status
    // row. The server loop-breaker caps repeats (round 3 closes terminally).
    const onQuickReply = vi.fn(async () => {});
    const before: ChatMessage[] = [
      { id: "user_f3_kick_live", role: "user", content: "Bygg integrationer nu." },
    ];
    const { rerender } = render(
      <MessageList chatId="chat_f3_live" messages={before} onQuickReply={onQuickReply} />,
    );

    const after: ChatMessage[] = [
      ...before,
      {
        id: "assistant_f3_marker_live",
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
    rerender(
      <MessageList chatId="chat_f3_live" messages={after} onQuickReply={onQuickReply} />,
    );

    await waitFor(() => {
      expect(onQuickReply).toHaveBeenCalledWith("Godkänn förslag", { planMode: false });
    });
    // Auto-fires exactly once, no dialog, calm status row instead.
    expect(onQuickReply).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Svar krävs för att fortsätta")).toBeNull();
    expect(screen.getByText("Integrationsbygget fortsätter automatiskt…")).toBeTruthy();
  });
});
