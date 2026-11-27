import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";

vi.mock("./sajtagent/SajtagentProvider", () => ({ useSajtagent: () => null }));

import { FloatingCollapsedChatInput } from "./FloatingCollapsedChatInput";

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width: 1024px"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

const messages: ChatMessage[] = [
  { id: "u1", role: "user", content: "Bygg en sajt" },
  { id: "a1", role: "assistant", content: "Klart." },
];

function Draft() {
  const [value, setValue] = useState("");
  return <textarea aria-label="Utkast" value={value} onChange={(e) => setValue(e.target.value)} />;
}

function renderFloat(floatEnabled = true, onToggleCollapse = vi.fn(), onOpenCube = vi.fn()) {
  return render(
    <FloatingCollapsedChatInput
      floatEnabled={floatEnabled}
      chatId="chat_1"
      isCollapsed
      onToggleCollapse={onToggleCollapse}
      onOpenCube={onOpenCube}
      builderMessages={messages}
      isStreaming={false}
    >
      <Draft />
    </FloatingCollapsedChatInput>,
  );
}

describe("FloatingCollapsedChatInput — växla mellan komposer och chatt", () => {
  it("är smalare än förut (28rem i stället för 42rem)", () => {
    renderFloat();
    const card = screen.getByTestId("floating-collapsed-chat-input");
    // jsdom tolkar inte min() i style.width; klassen bär samma gräns.
    expect(card.className).toContain("max-w-md");
    expect(card.className).not.toContain("max-w-2xl");
  });

  it("behåller utkastet synligt och erbjuder sidopanel eller kub direkt", () => {
    const onToggle = vi.fn();
    const onOpenCube = vi.fn();
    renderFloat(true, onToggle, onOpenCube);
    const draft = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Utkast" });
    fireEvent.change(draft, { target: { value: "Byt rubriken" } });
    fireEvent.click(screen.getByRole("button", { name: "Visa chatten (2 meddelanden)" }));
    fireEvent.click(screen.getByRole("button", { name: "Öppna byggkuben" }));
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onOpenCube).toHaveBeenCalledOnce();
    expect(draft.value).toBe("Byt rubriken");
    expect(screen.queryByRole("button", { name: "Fäll ihop inmatningen" })).toBeNull();
  });

  it("erbjuder ingen ihopfällning när kortet inte flyter", () => {
    renderFloat(false);
    expect(screen.queryByRole("button", { name: "Fäll ihop inmatningen" })).toBeNull();
  });
});
