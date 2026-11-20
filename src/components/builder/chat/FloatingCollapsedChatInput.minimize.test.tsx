/**
 * Det flytande kortet täckte 22 % av förhandsvisningen (V-riggen 2026-11-11).
 * Det är nu smalare och kan fällas ihop till en knapp utan att inmatningen
 * avmonteras, så utkastet ligger kvar.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
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

function renderFloat(floatEnabled = true) {
  return render(
    <FloatingCollapsedChatInput
      floatEnabled={floatEnabled}
      chatId="chat_1"
      isCollapsed
      onToggleCollapse={vi.fn()}
      builderMessages={messages}
      isStreaming={false}
    >
      <Draft />
    </FloatingCollapsedChatInput>,
  );
}

describe("FloatingCollapsedChatInput — fäll ihop det flytande kortet", () => {
  it("är smalare än förut (28rem i stället för 42rem)", () => {
    renderFloat();
    const card = screen.getByTestId("floating-collapsed-chat-input");
    // jsdom tolkar inte min() i style.width; klassen bär samma gräns.
    expect(card.className).toContain("max-w-md");
    expect(card.className).not.toContain("max-w-2xl");
  });

  it("fäller ihop till en knapp och tillbaka utan att tappa utkastet", () => {
    renderFloat();
    fireEvent.change(screen.getByRole("textbox", { name: "Utkast" }), { target: { value: "Byt rubriken" } });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fäll ihop inmatningen" }));
    });
    expect(screen.queryByRole("textbox", { name: "Utkast" })).toBeNull();
    const restore = screen.getByRole("button", { name: "Visa inmatningen (2 meddelanden)" });
    expect(document.activeElement).toBe(restore);
    // Dockad i ett hörn, inte kvar mitt över sajten.
    const card = screen.getByTestId("floating-collapsed-chat-input");
    expect(card.style.left).toBe("1rem");
    expect(card.style.bottom).toBe("1rem");
    expect(card.style.top).toBe("");

    act(() => {
      fireEvent.click(restore);
    });
    const draft = screen.getByRole("textbox", { name: "Utkast" }) as HTMLTextAreaElement;
    expect(draft.value).toBe("Byt rubriken");
    expect(document.activeElement).toBe(draft);
  });

  it("erbjuder ingen ihopfällning när kortet inte flyter", () => {
    renderFloat(false);
    expect(screen.queryByRole("button", { name: "Fäll ihop inmatningen" })).toBeNull();
  });
});
