/**
 * Räknaren i chattens fällrad räknar den synliga konversationen: byggmotorns
 * och Sajtagentens rader (UX-granskningen 2026-11-11, avsnitt C). Förut
 * skickade buildern `vm.messages.length`, så Sajtagentens frågor och svar
 * syntes i tidslinjen men inte i räknaren.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import type { SajtagentContextValue } from "./sajtagent/SajtagentProvider";

const sajtagent = vi.hoisted(() => ({ value: null as SajtagentContextValue | null }));
vi.mock("./sajtagent/SajtagentProvider", () => ({
  useSajtagent: () => sajtagent.value,
}));

import { FloatingCollapsedChatInput } from "./FloatingCollapsedChatInput";

function agentWith(messages: OpenClawMessage[]): SajtagentContextValue {
  return {
    available: true,
    messages,
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
    armedMandate: null,
    campaignScript: null,
  };
}

const builder = (id: string, role: "user" | "assistant", content = "x"): ChatMessage => ({
  id,
  role,
  content,
});
const agentRow = (id: string, role: "user" | "assistant"): OpenClawMessage => ({
  id,
  role,
  content: "fråga eller svar",
  timestamp: 1,
  kind: "chat",
});

function renderInput(chatId: string, builderMessages: ChatMessage[]) {
  return (
    <FloatingCollapsedChatInput
      floatEnabled={false}
      chatId={chatId}
      isCollapsed
      onToggleCollapse={vi.fn()}
      builderMessages={builderMessages}
      isStreaming={false}
    >
      <div />
    </FloatingCollapsedChatInput>
  );
}

afterEach(() => {
  sajtagent.value = null;
});

describe("FloatingCollapsedChatInput — räknaren", () => {
  it("visar ingen räknare innan något har skickats", () => {
    render(renderInput("chat_1", []));
    expect(screen.queryByTestId("chat-output-collapse-bar")).toBeNull();
  });

  it("räknar Sajtagentens rader tillsammans med byggmotorns", () => {
    sajtagent.value = agentWith([agentRow("q1", "user"), agentRow("r1", "assistant")]);
    render(renderInput("chat_1", [builder("u1", "user"), builder("a1", "assistant")]));
    expect(screen.getByRole("button", { name: "Visa chatten (4 meddelanden)" })).toBeTruthy();
  });

  it("följer med vid projektbyte och tar inte med förra chattens rader", () => {
    sajtagent.value = agentWith([agentRow("q1", "user"), agentRow("r1", "assistant")]);
    const { rerender } = render(
      renderInput("chat_1", [builder("u1", "user"), builder("a1", "assistant")]),
    );
    expect(screen.getByText("4 meddelanden")).toBeTruthy();

    // Byte: providern tömmer agentens rader för den nya chatten.
    sajtagent.value = agentWith([]);
    rerender(renderInput("chat_2", [builder("u9", "user")]));
    expect(screen.getByText("1 meddelande")).toBeTruthy();
  });
});
