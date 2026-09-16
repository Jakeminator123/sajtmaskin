import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KOSTNADSFRI_HANDOFF_INTRO_ID } from "@/lib/kostnadsfri/agent-campaign-script";
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

const avatarMock = vi.hoisted(() => ({
  videoRef: vi.fn(),
  connectionState: "error" as "idle" | "connecting" | "connected" | "speaking" | "error",
  avatarReady: false,
  speak: vi.fn(),
  reconnect: vi.fn(),
  available: true,
}));

vi.mock("@/lib/openclaw/use-did-avatar", () => ({
  DID_AVATAR_AVAILABLE: true,
  useDidAvatar: () => ({ ...avatarMock }),
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
  avatarMock.videoRef = vi.fn();
  avatarMock.connectionState = "error";
  avatarMock.avatarReady = false;
  avatarMock.speak = vi.fn();
  avatarMock.reconnect = vi.fn();
  avatarMock.available = true;
  act(() => {
    useOpenClawStore.setState({
      isOpen: true,
      avatarMode: true,
      panelPresentation: "takeover",
      editEnabled: false,
      powersOn: false,
      grantedPowers: [],
      messages: [],
    });
  });
});

describe("OpenClawChatPanel takeover degradation", () => {
  it("keeps the message list and chat input when the avatar is unavailable", () => {
    render(<OpenClawChatPanel onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText("Fråga Sajtagenten...")).toBeTruthy();
    expect(screen.getByText("Hej från takeover-test")).toBeTruthy();
    expect(screen.getByText("Textsvaret syns utan avatar")).toBeTruthy();
    expect(screen.getByText("Avataren kunde inte ansluta")).toBeTruthy();
    expect(screen.getByText("Textchatten fungerar under tiden.")).toBeTruthy();
    const stage = screen.getByTestId("openclaw-avatar-stage");
    expect(stage.getAttribute("data-avatar-stage")).toBe("compact");
    expect(stage.className).not.toContain("lg:flex-row");
    expect(stage.className).not.toContain("46dvh");
    expect(screen.queryByTestId("openclaw-avatar-video")).toBeNull();
    expect(screen.getByRole("button", { name: "Tillbaka till bubbla" })).toBeTruthy();
  });

  it("keeps connecting status compact until the live portrait is ready", () => {
    avatarMock.connectionState = "connecting";
    avatarMock.avatarReady = false;
    render(<OpenClawChatPanel onClose={vi.fn()} />);

    const stage = screen.getByTestId("openclaw-avatar-stage");
    expect(stage.getAttribute("data-avatar-stage")).toBe("compact");
    expect(screen.getByText("Startar avataren...")).toBeTruthy();
    expect(screen.queryByTestId("openclaw-avatar-video")).toBeNull();
    expect(stage.innerHTML).not.toContain("46dvh");
    expect(stage.className).not.toContain("h-[min(400px,46dvh)]");
  });

  it("returns to bubble from the visible button and from Escape", () => {
    render(<OpenClawChatPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Tillbaka till bubbla" }));
    expect(useOpenClawStore.getState().panelPresentation).toBe("bubble");

    act(() => {
      useOpenClawStore.setState({ panelPresentation: "takeover" });
    });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(useOpenClawStore.getState().panelPresentation).toBe("bubble");
  });

  it("stays in takeover when Escape is already defaultPrevented", () => {
    render(<OpenClawChatPanel onClose={vi.fn()} />);

    const event = createEvent.keyDown(window, { key: "Escape" });
    event.preventDefault();
    fireEvent(window, event);

    expect(useOpenClawStore.getState().panelPresentation).toBe("takeover");
  });

  it("stays in takeover when Escape targets a sibling dialog", () => {
    render(
      <>
        <OpenClawChatPanel onClose={vi.fn()} />
        <div role="dialog" aria-label="Mini-wizard">
          <button type="button">Stäng wizard</button>
        </div>
      </>,
    );

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Mini-wizard" }), {
      key: "Escape",
    });

    expect(useOpenClawStore.getState().panelPresentation).toBe("takeover");
  });

  it("sets aria-modal only while takeover is active", () => {
    render(<OpenClawChatPanel onClose={vi.fn()} />);

    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");

    act(() => {
      useOpenClawStore.setState({ panelPresentation: "bubble" });
    });

    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBeNull();
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

  it("places a live portrait avatar above the transcript, not beside it", () => {
    avatarMock.avatarReady = true;
    avatarMock.connectionState = "connected";
    const { container } = render(<OpenClawChatPanel onClose={vi.fn()} />);

    const stage = screen.getByTestId("openclaw-avatar-stage");
    const video = screen.getByTestId("openclaw-avatar-video");
    const transcript = screen.getByText("Hej från takeover-test");
    const body = container.firstElementChild?.children[1];

    expect(stage.compareDocumentPosition(transcript) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(stage.getAttribute("data-avatar-stage")).toBe("portrait");
    expect(video.className).toContain("object-cover");
    expect(video.className).toContain("object-top");
    expect(video.className).toContain("opacity-100");
    expect(stage.firstElementChild?.className).toContain("aspect-4/5");
    expect(stage.firstElementChild?.className).toContain("h-[min(400px,46dvh)]");
    expect(body?.className).toBe("flex min-h-0 flex-1 flex-col");
    expect(body?.className).not.toContain("lg:flex-row");
  });

  it("speaks the seeded campaign greeting once, only when ready and connected", () => {
    avatarMock.avatarReady = false;
    avatarMock.connectionState = "connected";
    chatMock.messages = [
      {
        id: KOSTNADSFRI_HANDOFF_INTRO_ID,
        role: "assistant",
        content: "Välkommen Cabanellas. Skriv i chatten under min skärmbild.",
        timestamp: 1,
      },
    ];

    const { rerender } = render(<OpenClawChatPanel onClose={vi.fn()} />);
    expect(avatarMock.speak).not.toHaveBeenCalled();

    avatarMock.avatarReady = true;
    rerender(<OpenClawChatPanel onClose={vi.fn()} />);
    expect(avatarMock.speak).toHaveBeenCalledTimes(1);
    expect(avatarMock.speak).toHaveBeenCalledWith(
      "Välkommen Cabanellas. Skriv i chatten under min skärmbild.",
    );

    avatarMock.connectionState = "speaking";
    rerender(<OpenClawChatPanel onClose={vi.fn()} />);
    avatarMock.connectionState = "connected";
    rerender(<OpenClawChatPanel onClose={vi.fn()} />);
    expect(avatarMock.speak).toHaveBeenCalledTimes(1);
  });
});
