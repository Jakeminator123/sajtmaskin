import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCampaignScript } from "@/lib/kostnadsfri/agent-campaign-script";
import { OpenClawChatPanel } from "./OpenClawChatPanel";
import { useOpenClawStore, type OpenClawMessage } from "@/lib/openclaw/openclaw-store";

const chat = vi.hoisted(() => ({ messages: [] as OpenClawMessage[] }));

vi.mock("./useOpenClawChat", () => ({
  useOpenClawChat: () => ({
    messages: chat.messages,
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
  }),
}));

beforeEach(() => {
  chat.messages = [];
  // The panel's mount effect fetches /api/openclaw/health and writes the store.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ debugEnabled: false, editEnabled: true }),
    })),
  );
  act(() => {
    useOpenClawStore.setState({
      avatarMode: false,
      panelPresentation: "bubble",
      editEnabled: false,
      powersOn: false,
      grantedPowers: [],
      campaignScript: null,
    });
  });
});

describe("OpenClawChatPanel", () => {
  it("sends completed replies to Alina and keeps an interrupted stream silent", () => {
    act(() => useOpenClawStore.setState({ avatarMode: true }));
    const { rerender } = render(<OpenClawChatPanel onClose={vi.fn()} localAlina />);
    const frame = screen.getByTitle("Alina i studion") as HTMLIFrameElement;
    const target = frame.contentWindow!;
    const post = vi.spyOn(target, "postMessage");
    fireEvent(window, new MessageEvent("message", {
      origin: location.origin,
      source: target,
      data: { type: "alina:ready" },
    }));
    const question: OpenClawMessage = { id: "question", role: "user", timestamp: 0, content: "Hej!" };
    chat.messages = [question, {
      id: "failed", role: "assistant", timestamp: 1,
      delivery: "interrupted", content: "Tekniskt fel.",
    }];
    rerender(<OpenClawChatPanel onClose={vi.fn()} localAlina />);
    expect(post.mock.calls.filter(([message]) => message.type === "alina:reply")).toHaveLength(0);
    const nextQuestion = { ...question, id: "next-question" };
    chat.messages = [question, nextQuestion, {
      id: "done", role: "assistant", timestamp: 2,
      delivery: "complete", content: "Hej Jakob!",
    }];
    rerender(<OpenClawChatPanel onClose={vi.fn()} localAlina />);
    expect(post).toHaveBeenCalledWith({
      type: "alina:reply", text: "Hej Jakob!", turn: "next-question", summary: false, readyAt: expect.any(Number),
    }, location.origin);
  });

  it("uses viewport-clamped sizing classes for narrow screens", () => {
    const { container } = render(<OpenClawChatPanel onClose={vi.fn()} />);
    const panel = container.firstElementChild as HTMLElement | null;

    expect(panel).toBeTruthy();
    expect(panel?.className).toContain("w-[min(380px,calc(100vw-1rem))]");
    expect(panel?.className).toContain("max-w-[calc(100vw-1rem)]");
    expect(panel?.className).toContain("h-[min(580px,calc(100dvh-4.5rem))]");
  });

  it("starts as a clean text chat without canned question buttons", () => {
    render(<OpenClawChatPanel onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText("Fråga Sajtagenten...")).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Hur kan Sajtagenten hjälpa ett småföretag på sajten?",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Hur fungerar Sajtagenten i buildern i dag?",
      }),
    ).toBeNull();
  });

  it.each([
    ["builder with a chat", { page: "builder", chatId: "site-chat", projectId: "site" }, "site-chat", null],
    ["builder before its first chat", { page: "builder", projectId: "site" }, null, "site"],
    ["outside the builder", { page: "account", chatId: "old-chat", projectId: "old-site" }, null, null],
  ] as const)("uploads to the matching library on %s", async (_name, context, chatId, projectId) => {
    const previousContext = window.__SITEMASKIN_CONTEXT;
    window.__SITEMASKIN_CONTEXT = context as typeof window.__SITEMASKIN_CONTEXT;
    try {
      const { container } = render(<OpenClawChatPanel onClose={vi.fn()} />);
      fireEvent.click(screen.getByText("Bilagor till frågan"));
      const upload = container.querySelector('input[type="file"]')!;
      fireEvent.change(upload, { target: {
        files: [new File(["image"], "hero.png", { type: "image/png" })],
      } });
      await waitFor(() => {
        const call = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/media/upload");
        const body = call?.[1]?.body as FormData | undefined;
        expect(body?.get("chatId")).toBe(chatId);
        expect(body?.get("projectId")).toBe(projectId);
        expect(body?.get("mediaScope")).toBe(chatId || projectId ? "media-library" : null);
      });
    } finally {
      window.__SITEMASKIN_CONTEXT = previousContext;
    }
  });

  it("keeps the collapsed panel out of the accessibility tree", () => {
    const { container } = render(<OpenClawChatPanel onClose={vi.fn()} isOpen={false} />);
    const panel = container.firstElementChild as HTMLElement;

    expect(panel.getAttribute("aria-hidden")).toBe("true");
    expect(panel.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the live drag transform through unrelated React re-renders", () => {
    const { container, rerender } = render(<OpenClawChatPanel onClose={vi.fn()} />);
    const panel = container.firstElementChild as HTMLElement;
    const header = screen.getByTitle("Dra för att flytta — dubbelklicka för att återställa position");

    fireEvent.pointerDown(header, {
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(header, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 145,
      clientY: 125,
    });
    expect(panel.style.transform).toBe("translate3d(45px, 25px, 0)");

    rerender(<OpenClawChatPanel onClose={vi.fn()} powersAvailable />);

    expect(panel.style.transform).toBe("translate3d(45px, 25px, 0)");
    fireEvent.pointerUp(header, { pointerId: 1, pointerType: "mouse" });
  });

  // Extra powers can only act where the builder composer/versions exist, so the
  // control is opt-in per surface: absent by default (landing, kostnadsfri),
  // present only when the builder mounts the panel with powersAvailable.
  it("hides the powers control unless the surface makes it available", async () => {
    render(<OpenClawChatPanel onClose={vi.fn()} />);
    await waitFor(() => {
      expect(useOpenClawStore.getState().editEnabled).toBe(true);
    });
    expect(screen.queryByRole("button", { name: "Låt agenten ändra" })).toBeNull();
  });

  it("shows the powers control on a builder surface with OC_EDIT on", async () => {
    render(<OpenClawChatPanel onClose={vi.fn()} powersAvailable />);
    expect(await screen.findByRole("button", { name: "Låt agenten ändra" })).toBeTruthy();
  });

  it("visar rådgivningskvot och hoppa-över utan generering/ombyggnad", () => {
    act(() => {
      useOpenClawStore.setState({ campaignScript: emptyCampaignScript("zax-2-0-ab") });
    });
    const { container } = render(<OpenClawChatPanel onClose={vi.fn()} />);

    expect(screen.getByTestId("kampanj-radgivning-kvar").textContent).toContain("rådgivning");
    expect(screen.getByRole("button", { name: "Fortsätt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hoppa över frågorna" })).toBeTruthy();
    expect(container.textContent?.toLowerCase()).not.toMatch(/generering|ombyggnad/);

    fireEvent.click(screen.getByRole("button", { name: "Hoppa över frågorna" }));

    expect(useOpenClawStore.getState().campaignScript?.followupsSkipped).toBe(true);
    expect(useOpenClawStore.getState().campaignScript?.followupsCompleted).toBe(true);
    expect(screen.queryByRole("button", { name: "Hoppa över frågorna" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fortsätt" })).toBeNull();
  });

  it("tar bort kvot-chrome vid scope-byte till /konto", () => {
    act(() => {
      useOpenClawStore.setState({
        scopeKey: "/kostnadsfri/zax-2-0-ab::kostnadsfri",
        campaignScript: emptyCampaignScript("zax-2-0-ab"),
      });
    });
    render(<OpenClawChatPanel onClose={vi.fn()} />);
    expect(screen.getByTestId("kampanj-radgivning-kvar")).toBeTruthy();

    act(() => {
      useOpenClawStore.getState().setScope("/konto::account");
    });

    expect(useOpenClawStore.getState().campaignScript).toBeNull();
    expect(screen.queryByTestId("kampanj-radgivning-kvar")).toBeNull();
  });

  it("tar bort kvot-chrome vid scope-byte till annan slug", () => {
    act(() => {
      useOpenClawStore.setState({
        scopeKey: "/kostnadsfri/zax-2-0-ab::kostnadsfri",
        campaignScript: emptyCampaignScript("zax-2-0-ab"),
      });
    });
    render(<OpenClawChatPanel onClose={vi.fn()} />);
    expect(screen.getByTestId("kampanj-radgivning-kvar")).toBeTruthy();

    act(() => {
      useOpenClawStore.getState().setScope("/kostnadsfri/other-campaign::kostnadsfri");
    });

    expect(useOpenClawStore.getState().campaignScript).toBeNull();
    expect(screen.queryByTestId("kampanj-radgivning-kvar")).toBeNull();
  });
});
