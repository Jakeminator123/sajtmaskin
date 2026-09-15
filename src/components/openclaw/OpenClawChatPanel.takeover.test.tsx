import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenClawChatPanel } from "./OpenClawChatPanel";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";

const chatMock = vi.hoisted(() => ({
  messages: [] as Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
  }>,
  isStreaming: false,
  send: vi.fn(),
  stop: vi.fn(),
  clearConversation: vi.fn(),
}));

vi.mock("./useOpenClawChat", () => ({
  useOpenClawChat: () => ({
    messages: chatMock.messages,
    isStreaming: chatMock.isStreaming,
    send: chatMock.send,
    stop: chatMock.stop,
    clearConversation: chatMock.clearConversation,
  }),
}));

vi.mock("@/lib/openclaw/use-did-avatar", () => ({
  DID_AVATAR_AVAILABLE: true,
  useDidAvatar: () => ({
    videoRef: { current: null },
    connectionState: "error",
    avatarReady: false,
    speak: vi.fn(),
    reconnect: vi.fn(),
    available: true,
  }),
  truncateForSpeech: (text: string) => text,
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ debugEnabled: false, editEnabled: false }),
    })),
  );
  chatMock.messages = [
    {
      id: "user-1",
      role: "user",
      content: "Hej från takeover-test",
      timestamp: 1,
    },
    {
      id: "assistant-1",
      role: "assistant",
      content: "Textsvaret syns utan avatar",
      timestamp: 2,
    },
  ];
  chatMock.isStreaming = false;
  act(() => {
    useOpenClawStore.setState({
      isOpen: true,
      avatarMode: true,
      panelPresentation: "takeover",
      editEnabled: false,
      powersOn: false,
      grantedPowers: [],
    });
  });
});

describe("OpenClawChatPanel takeover degradation", () => {
  it("keeps the message list and chat input when the avatar is unavailable", () => {
    const { container } = render(<OpenClawChatPanel onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText("Fråga Sajtagenten...")).toBeTruthy();
    expect(screen.getByText("Hej från takeover-test")).toBeTruthy();
    expect(screen.getByText("Textsvaret syns utan avatar")).toBeTruthy();
    expect(screen.getByText("Avataren kunde inte ansluta")).toBeTruthy();
    expect(screen.getByText("Textchatten fungerar under tiden.")).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByRole("button", { name: "Tillbaka till bubbla" })).toBeTruthy();
  });

  it("returns to bubble from the visible button and from Escape", () => {
    render(<OpenClawChatPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Tillbaka till bubbla" }));
    expect(useOpenClawStore.getState().panelPresentation).toBe("bubble");

    act(() => {
      useOpenClawStore.setState({ panelPresentation: "takeover" });
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useOpenClawStore.getState().panelPresentation).toBe("bubble");
  });

  it("renders takeover as a text chat when avatar mode is off", () => {
    act(() => {
      useOpenClawStore.setState({ avatarMode: false });
    });
    const { container } = render(<OpenClawChatPanel onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText("Fråga Sajtagenten...")).toBeTruthy();
    expect(screen.getByText("Hej från takeover-test")).toBeTruthy();
    expect(screen.getByText("Textläge")).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
  });

  it("does not apply a drag transform while takeover is active", () => {
    const { container } = render(<OpenClawChatPanel onClose={vi.fn()} />);
    const panel = container.firstElementChild as HTMLElement;
    const header = screen.getByRole("dialog").firstElementChild;

    expect(panel.style.transform).toBe("translate3d(0px, 0px, 0)");
    expect(header).toBeTruthy();

    fireEvent.pointerDown(header as HTMLElement, {
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(header as HTMLElement, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 180,
      clientY: 160,
    });

    expect(panel.style.transform).toBe("translate3d(0px, 0px, 0)");
  });
});
