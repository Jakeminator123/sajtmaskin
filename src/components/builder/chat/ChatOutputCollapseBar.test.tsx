/**
 * Spår 03 steg 3 (Ö9) — chattens utdata kan fällas ned till inputens
 * överkant, och läget överlever omladdning.
 */
import { fireEvent, render, renderHook, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatOutputCollapseBar } from "./ChatOutputCollapseBar";
import { useChatOutputCollapse } from "./useChatOutputCollapse";
import { readChatOutputCollapsed } from "@/lib/builder/chat-output-collapse";

describe("ChatOutputCollapseBar", () => {
  it("erbjuder att fälla ned när utdata syns", () => {
    const onToggle = vi.fn();
    render(
      <ChatOutputCollapseBar
        isCollapsed={false}
        onToggle={onToggle}
        messageCount={4}
        isStreaming={false}
      />,
    );

    const button = screen.getByRole("button", { name: "Fäll ned chatten" });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("säger hur många meddelanden som är dolda i nedfällt läge", () => {
    render(
      <ChatOutputCollapseBar
        isCollapsed
        onToggle={vi.fn()}
        messageCount={4}
        isStreaming={false}
      />,
    );

    const button = screen.getByRole("button", { name: "Visa chatten (4 meddelanden)" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("visar att en generering pågår även när utdata är nedfällt", () => {
    render(
      <ChatOutputCollapseBar isCollapsed onToggle={vi.fn()} messageCount={2} isStreaming />,
    );

    expect(screen.getByText("Bygger …")).toBeTruthy();
  });

  it("låter en blockerande status ligga kvar i raden, inte i det nedfällda", () => {
    render(
      <ChatOutputCollapseBar
        isCollapsed
        onToggle={vi.fn()}
        messageCount={2}
        isStreaming={false}
        statusText="Nycklar saknas"
      />,
    );

    expect(screen.getByText("Nycklar saknas")).toBeTruthy();
  });
});

describe("useChatOutputCollapse", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sparar läget per chat så det överlever omladdning", () => {
    const { result } = renderHook(() => useChatOutputCollapse("chat_a"));

    expect(result.current.isCollapsed).toBe(false);
    act(() => result.current.toggle());

    expect(result.current.isCollapsed).toBe(true);
    expect(readChatOutputCollapsed("chat_a")).toBe(true);

    // En ny montering (= omladdning) läser tillbaka samma läge.
    const remounted = renderHook(() => useChatOutputCollapse("chat_a"));
    expect(remounted.result.current.isCollapsed).toBe(true);
  });

  it("låter en nedfälld chat vara nedfälld bara i sin egen chat", () => {
    const { result, rerender } = renderHook(({ chatId }) => useChatOutputCollapse(chatId), {
      initialProps: { chatId: "chat_a" },
    });

    act(() => result.current.toggle());
    expect(result.current.isCollapsed).toBe(true);

    rerender({ chatId: "chat_b" });
    expect(result.current.isCollapsed).toBe(false);
  });
});
