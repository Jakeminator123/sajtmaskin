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

const navigation = vi.hoisted(() => ({ pathname: "/kostnadsfri/zax-2-0-ab" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

const avatarMock = vi.hoisted(() => ({
  videoRef: vi.fn(),
  connectionState: "idle" as "idle" | "connecting" | "connected" | "speaking" | "error",
  avatarReady: false,
  speak: vi.fn(),
  reconnect: vi.fn(),
  available: true,
}));

const useDidAvatarMock = vi.hoisted(() =>
  vi.fn((options?: { enabled?: boolean }) => {
    void options;
    return { ...avatarMock };
  }),
);

vi.mock("@/lib/openclaw/use-did-avatar", () => ({
  DID_AVATAR_AVAILABLE: true,
  useDidAvatar: (options?: { enabled?: boolean }) => useDidAvatarMock(options),
  truncateForSpeech: (text: string) => text,
}));

vi.mock("./useOpenClawChat", () => ({
  useOpenClawChat: () => ({
    messages: useOpenClawStore.getState().messages,
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
  }),
}));

describe("OpenClawChat handoff avatar isolation", () => {
  beforeEach(() => {
    navigation.pathname = "/kostnadsfri/zax-2-0-ab";
    delete window.__SITEMASKIN_CONTEXT;
    clearCampaignScriptStorageForTests();
    useDidAvatarMock.mockClear();
    avatarMock.videoRef = vi.fn();
    avatarMock.connectionState = "idle";
    avatarMock.avatarReady = false;
    avatarMock.speak = vi.fn();
    avatarMock.reconnect = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ debugEnabled: false, editEnabled: false }),
      })),
    );
    act(() => {
      useOpenClawStore.setState({
        isOpen: false,
        messages: [],
        isStreaming: false,
        scopeKey: "/kostnadsfri/zax-2-0-ab",
        avatarMode: false,
        panelPresentation: "bubble",
        campaignScript: null,
      });
    });
  });

  it("handoff may connect D-ID, but FAB after close stays text-first", async () => {
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
      expect(state.avatarMode).toBe(true);
      expect(state.panelPresentation).toBe("takeover");
      expect(state.messages.some((message) => message.id === KOSTNADSFRI_HANDOFF_INTRO_ID)).toBe(
        true,
      );
    });

    expect(useDidAvatarMock).toHaveBeenCalledWith({ enabled: true });

    act(() => {
      useOpenClawStore.getState().close();
    });

    expect(useOpenClawStore.getState()).toMatchObject({
      isOpen: false,
      avatarMode: false,
      panelPresentation: "bubble",
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Fråga Sajtagenten — öppna chattrutan" }),
      ).toBeTruthy();
    });

    useDidAvatarMock.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "Fråga Sajtagenten — öppna chattrutan" }),
    );

    expect(useOpenClawStore.getState()).toMatchObject({
      isOpen: true,
      avatarMode: false,
      panelPresentation: "bubble",
    });
    expect(useDidAvatarMock).toHaveBeenCalled();
    expect(useDidAvatarMock.mock.calls.every(([options]) => options?.enabled !== true)).toBe(true);
    expect(useDidAvatarMock).toHaveBeenLastCalledWith({ enabled: false });
  });
});
