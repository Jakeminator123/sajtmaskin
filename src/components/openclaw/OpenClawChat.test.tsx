// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCampaignScriptStorageForTests,
  KOSTNADSFRI_HANDOFF_INTRO_ID,
} from "@/lib/kostnadsfri/agent-campaign-script";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { OpenClawChat } from "./OpenClawChat";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
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
    navigation.pathname = "/";
    delete window.__SITEMASKIN_CONTEXT;
    clearCampaignScriptStorageForTests();
    act(() => {
      useOpenClawStore.setState({
        isOpen: false,
        messages: [],
        isStreaming: false,
        scopeKey: "/",
        panelPresentation: "bubble",
        campaignScript: null,
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

  it("hides the kostnadsfri teaser card but keeps the chat launcher", async () => {
    navigation.pathname = "/kostnadsfri/zax-2-0-ab";
    render(<OpenClawChat />);

    expect(screen.queryByText(/Visa Zax 2 0 AB med/i)).toBeNull();
    expect(screen.queryByText(/Prova Sajtagenten för/i)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Fråga Sajtagenten — öppna chattrutan" }),
    );

    expect(await screen.findByRole("dialog", { name: "Sajtagenten chatt" })).toBeTruthy();
    expect(useOpenClawStore.getState().isOpen).toBe(true);
  });

  it("covers the preview surface at z-50 while takeover is on", () => {
    act(() => {
      useOpenClawStore.setState({ isOpen: true, panelPresentation: "takeover" });
    });
    const { container } = render(<OpenClawChat />);
    const shell = container.firstElementChild as HTMLElement;

    expect(shell.className).toContain("z-50");
    expect(shell.className).toContain("inset-4");
    expect(shell.className).not.toContain("z-[60]");
  });

  it("öppnar takeover exakt en gång när kampanjen når handoff", async () => {
    navigation.pathname = "/kostnadsfri/zax-2-0-ab";
    window.__SITEMASKIN_CONTEXT = {
      page: "kostnadsfri",
      kostnadsfriBrief: { stage: "wizard", companyName: "Zax Frisör" },
    };

    render(<OpenClawChat />);

    await waitFor(() => {
      expect(useOpenClawStore.getState().isOpen).toBe(false);
    });

    act(() => {
      window.__SITEMASKIN_CONTEXT = {
        page: "kostnadsfri",
        kostnadsfriBrief: {
          stage: "handoff",
          companyName: "Zax Frisör",
          contactFirstName: "Jan",
        },
      };
      window.dispatchEvent(new CustomEvent("sajtmaskin:context-updated"));
    });

    await waitFor(() => {
      const state = useOpenClawStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.panelPresentation).toBe("takeover");
      expect(state.messages.some((message) => message.id === KOSTNADSFRI_HANDOFF_INTRO_ID)).toBe(
        true,
      );
    });

    act(() => {
      window.dispatchEvent(new CustomEvent("sajtmaskin:context-updated"));
    });

    expect(
      useOpenClawStore.getState().messages.filter((message) => message.id === KOSTNADSFRI_HANDOFF_INTRO_ID),
    ).toHaveLength(1);

    act(() => {
      useOpenClawStore.setState({
        isOpen: false,
        panelPresentation: "bubble",
        messages: [],
      });
      window.dispatchEvent(new CustomEvent("sajtmaskin:context-updated"));
    });

    expect(useOpenClawStore.getState().isOpen).toBe(false);
    expect(useOpenClawStore.getState().messages).toEqual([]);
  });
});
