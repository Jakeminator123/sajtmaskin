// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { OpenClawChat } from "./OpenClawChat";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("./OpenClawChatPanel", () => ({
  DEFAULT_OPENCLAW_CHAT_PANEL_CONTENT: {
    badgeLabel: "AI-assistent",
    assistantLabel: "Sajtagenten",
    idleStatus: "Redo",
    emptyTitle: "Hej!",
    emptyBody: "Fråga mig.",
    inputPlaceholder: "Fråga Sajtagenten...",
  },
  OpenClawChatPanel: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div role="dialog" aria-label="Sajtagenten chatt">
        <button type="button" onClick={onClose}>
          Stäng panel
        </button>
      </div>
    ) : null,
}));

describe("OpenClawChat launcher", () => {
  beforeEach(() => {
    act(() => {
      useOpenClawStore.setState({
        isOpen: false,
        messages: [],
        isStreaming: false,
        scopeKey: "/",
      });
    });
  });

  it("uses one launcher and removes it while the panel is open", async () => {
    render(<OpenClawChat />);

    const launcher = screen.getByRole("button", {
      name: "Fråga Sajtagenten — öppna chattrutan",
    });
    fireEvent.click(launcher);

    expect(await screen.findByRole("dialog", { name: "Sajtagenten chatt" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Fråga Sajtagenten — öppna chattrutan" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Stäng panel" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Fråga Sajtagenten — öppna chattrutan" }),
      ).toBeTruthy();
    });
  });
});
