import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import type { DidConnectionState } from "@/lib/openclaw/use-did-avatar";
import { SajtagentAvatar } from "./SajtagentAvatar";

const state = vi.hoisted(() => ({
  enabled: true,
  agent: {
    available: true,
    isStreaming: false,
    messages: [] as OpenClawMessage[],
  },
  avatar: {
    connectionState: "connected" as DidConnectionState,
    avatarReady: true,
    releaseBlocked: false,
    videoRef: vi.fn(),
    speak: vi.fn(async () => undefined),
    reconnect: vi.fn(),
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("./SajtagentProvider", () => ({ useSajtagent: () => state.agent }));
vi.mock("@/lib/openclaw/use-did-avatar", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/openclaw/use-did-avatar")>();
  return {
    ...original,
    get DID_AVATAR_AVAILABLE() {
      return state.enabled;
    },
    useDidAvatar() {
      useEffect(() => {
        state.connect();
        return () => {
          state.disconnect();
        };
      }, []);
      return state.avatar;
    },
  };
});

const reply = (
  id: string,
  content = "Här är mitt svar.",
  extra: Partial<OpenClawMessage> = {},
): OpenClawMessage => ({
  id,
  role: "assistant",
  content,
  timestamp: 1,
  kind: "chat",
  delivery: "complete",
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.enabled = true;
  state.agent = {
    available: true,
    isStreaming: false,
    messages: [reply("old")],
  };
  Object.assign(state.avatar, {
    connectionState: "connected",
    avatarReady: true,
    releaseBlocked: false,
  });
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("SajtagentAvatar — voice output in the shared conversation", () => {
  it("connects only after opt-in and never replays existing history", () => {
    const { rerender } = render(<SajtagentAvatar />);
    expect(state.connect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aktivera avatar" }));
    expect(state.connect).toHaveBeenCalledTimes(1);
    expect(state.avatar.speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stäng av avatar" }));
    expect(state.disconnect).toHaveBeenCalledTimes(1);
    state.enabled = false;
    rerender(<SajtagentAvatar />);
    expect(
      screen.queryByRole("button", { name: "Aktivera avatar" }),
    ).toBeNull();
  });

  it("speaks only the visible completed answer, once, without action JSON", () => {
    const { rerender } = render(<SajtagentAvatar />);
    fireEvent.click(screen.getByRole("button", { name: "Aktivera avatar" }));
    const text =
      'Jag föreslår en tydligare rubrik.\n<openclaw-action>{"type":"start_build","prompt":"Byt rubrik"}</openclaw-action>';
    state.agent.isStreaming = true;
    state.agent.messages.push(reply("new", text, { delivery: "streaming" }));
    rerender(<SajtagentAvatar />);
    expect(state.avatar.speak).not.toHaveBeenCalled();
    state.agent.isStreaming = false;
    state.agent.messages = [reply("old"), reply("new", text)];
    rerender(<SajtagentAvatar />);
    expect(state.avatar.speak).toHaveBeenCalledWith(
      "Jag föreslår en tydligare rubrik.",
    );
    state.avatar.connectionState = "speaking";
    rerender(<SajtagentAvatar />);
    state.avatar.connectionState = "connected";
    rerender(<SajtagentAvatar />);
    expect(state.avatar.speak).toHaveBeenCalledTimes(1);
  });

  it("waits for the video connection and skips interrupted, internal and hydrated messages", () => {
    state.avatar.connectionState = "connecting";
    state.avatar.avatarReady = false;
    const { rerender } = render(<SajtagentAvatar />);
    fireEvent.click(screen.getByRole("button", { name: "Aktivera avatar" }));
    state.agent.messages.push(reply("new"));
    rerender(<SajtagentAvatar />);
    expect(state.avatar.speak).not.toHaveBeenCalled();
    state.avatar.connectionState = "connected";
    state.avatar.avatarReady = true;
    rerender(<SajtagentAvatar />);
    expect(state.avatar.speak).toHaveBeenCalledTimes(1);
    for (const extra of [
      { hydrated: true },
      { delivery: "interrupted" as const },
      { kind: "internal" as const },
    ]) {
      state.agent.messages.push(
        reply(`skip-${state.agent.messages.length}`, "Läs inte detta.", extra),
      );
      rerender(<SajtagentAvatar />);
    }
    expect(state.avatar.speak).toHaveBeenCalledTimes(1);
  });

  it("disconnects on chat changes and preserves text as fallback after connection errors", () => {
    const { rerender } = render(<SajtagentAvatar key="chat_a" />);
    fireEvent.click(screen.getByRole("button", { name: "Aktivera avatar" }));
    state.avatar.connectionState = "error";
    state.avatar.avatarReady = false;
    rerender(<SajtagentAvatar key="chat_a" />);
    expect(screen.getByRole("status").textContent).toContain(
      "fortsätta skriva",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Försök ansluta igen" }),
    );
    expect(state.avatar.reconnect).toHaveBeenCalledTimes(1);
    state.avatar.releaseBlocked = true;
    rerender(<SajtagentAvatar key="chat_a" />);
    expect(
      screen.queryByRole("button", { name: "Försök ansluta igen" }),
    ).toBeNull();
    rerender(<SajtagentAvatar key="chat_b" />);
    expect(state.disconnect).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Aktivera avatar" }),
    ).toBeTruthy();
    expect(state.connect).toHaveBeenCalledTimes(1);
  });
});
