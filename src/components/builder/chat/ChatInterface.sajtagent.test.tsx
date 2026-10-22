/**
 * En input, två mottagare: komposern skickar frågor till Sajtagenten och
 * byggordrar till byggmotorn (`composer-route.ts`). Samma mock-harness som
 * ChatInterface.draft-retention.test.tsx.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageOptions } from "@/lib/hooks/chat/types";
import type { SajtagentContextValue } from "./sajtagent/SajtagentProvider";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

vi.mock("@/components/forms/voice-recorder", () => ({ VoiceRecorder: () => null }));

vi.mock("@/components/media/file-upload-zone", () => ({
  FileUploadZone: () => null,
  filesToAttachments: () => [],
  filesToPromptText: () => "",
}));

vi.mock("@/components/media/media-drawer", () => ({ MediaDrawer: () => null }));
vi.mock("@/components/media/text-uploader", () => ({ TextUploader: () => null }));
vi.mock("@/components/openclaw/OpenClawPowersControl", () => ({
  OpenClawPowersControl: () => null,
}));

const sajtagent = vi.hoisted(() => ({ value: null as SajtagentContextValue | null }));
vi.mock("./sajtagent/SajtagentProvider", () => ({
  useSajtagent: () => sajtagent.value,
}));

import { ChatInterface } from "./ChatInterface";

function makeAgent(overrides: Partial<SajtagentContextValue> = {}): SajtagentContextValue {
  return {
    available: true,
    messages: [],
    isStreaming: false,
    send: vi.fn(async () => undefined),
    stop: vi.fn(),
    clearConversation: vi.fn(),
    armedMandate: null,
    campaignScript: null,
    ...overrides,
  };
}

afterEach(() => {
  sajtagent.value = null;
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
  vi.clearAllMocks();
});

async function typeAndSend(text: string) {
  const textarea = screen.getByRole("textbox", { name: "Skriv en uppdatering" });
  await act(async () => {
    fireEvent.change(textarea, { target: { value: text } });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  });
}

describe("ChatInterface — Sajtagenten i samma input", () => {
  it("skickar en fråga till Sajtagenten och lämnar byggmotorn orörd", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));

    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);
    await typeAndSend("Vad tycker du om startsidan?");

    expect(agent.send).toHaveBeenCalledWith("Vad tycker du om startsidan?");
    expect(onSendMessage).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        (screen.getByRole("textbox", { name: "Skriv en uppdatering" }) as HTMLTextAreaElement).value,
      ).toBe(""),
    );
  });

  it("skickar en byggorder till byggmotorn", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));

    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);
    await typeAndSend("Byt rubriken till Välkommen");

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage.mock.calls[0][0]).toBe("Byt rubriken till Välkommen");
    expect(agent.send).not.toHaveBeenCalled();
  });

  it("tvingar mottagaren via lägesväljaren", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));

    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);
    fireEvent.click(screen.getByRole("radio", { name: "Fråga" }));
    await typeAndSend("Byt rubriken till Välkommen");

    expect(agent.send).toHaveBeenCalledWith("Byt rubriken till Välkommen");
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("visar en live-hint om mottagaren och en stoppknapp medan agenten svarar", async () => {
    const agent = makeAgent({ isStreaming: true });
    sajtagent.value = agent;

    render(<ChatInterface chatId="chat_1" onSendMessage={vi.fn()} />);
    expect(screen.getByTestId("composer-route-hint").textContent).toContain("Sajtagenten svarar");
    fireEvent.click(screen.getByRole("button", { name: "Stoppa Sajtagenten" }));
    expect(agent.stop).toHaveBeenCalledTimes(1);
  });

  it("håller inputen öppen under ett bygge för frågor, men spärrar byggvägen", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));

    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} isBusy />);
    expect(screen.getByRole("radio", { name: "Bygg" }).hasAttribute("disabled")).toBe(true);

    await typeAndSend("Byt rubriken till Välkommen");
    expect(onSendMessage).not.toHaveBeenCalled();

    await typeAndSend("Hur lång tid tar bygget?");
    expect(agent.send).toHaveBeenCalledWith("Hur lång tid tar bygget?");
  });

  it("beter sig som förut utan Sajtagent: allt går till byggmotorn", async () => {
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));

    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    await typeAndSend("Vad tycker du om startsidan?");
    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });
});
