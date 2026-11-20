/**
 * Välkomstpanelen läser komposerns utkast och kan starta första bygget
 * (`welcome-composer-bridge.ts`, paket F). Startknappen ska göra exakt samma
 * utskick som Skicka och bara finnas när Skicka skulle bygga.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getWelcomeComposerSnapshot } from "@/lib/builder/welcome-composer-bridge";

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
vi.mock("./sajtagent/SajtagentProvider", () => ({ useSajtagent: () => null }));

import { ChatInterface } from "./ChatInterface";

afterEach(() => {
  vi.clearAllMocks();
});

describe("ChatInterface — välkomstpanelens brygga", () => {
  it("publicerar utkastet och startar första bygget som Skicka", async () => {
    const onCreateChat = vi.fn(async () => true);
    const { unmount } = render(<ChatInterface chatId={null} onCreateChat={onCreateChat} />);
    expect(getWelcomeComposerSnapshot().start).toBeNull();

    const text = "Ett kafé i Uppsala med surdegsbröd";
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: "Beskriv vad du vill bygga" }), {
        target: { value: text },
      });
    });
    const snapshot = getWelcomeComposerSnapshot();
    expect(snapshot.draft).toBe(text);
    expect(snapshot.start).not.toBeNull();

    await act(async () => {
      snapshot.start?.();
    });
    expect(onCreateChat).toHaveBeenCalledTimes(1);
    expect(onCreateChat).toHaveBeenCalledWith(text, expect.anything());

    unmount();
    expect(getWelcomeComposerSnapshot()).toEqual({ draft: "", start: null });
  });

  it("ger exakt samma utskick som pilen", async () => {
    const text = "Ett kafé i Uppsala med surdegsbröd";
    const typeDraft = async () => {
      await act(async () => {
        fireEvent.change(screen.getByRole("textbox", { name: "Beskriv vad du vill bygga" }), {
          target: { value: text },
        });
      });
    };

    const viaWelcome = vi.fn(async () => true);
    const first = render(<ChatInterface chatId={null} onCreateChat={viaWelcome} />);
    await typeDraft();
    await act(async () => {
      getWelcomeComposerSnapshot().start?.();
    });
    first.unmount();

    const viaArrow = vi.fn(async () => true);
    render(<ChatInterface chatId={null} onCreateChat={viaArrow} />);
    await typeDraft();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skicka" }));
    });

    expect(viaWelcome).toHaveBeenCalledTimes(1);
    expect(viaArrow).toHaveBeenCalledTimes(1);
    expect(viaWelcome.mock.calls[0]).toEqual(viaArrow.mock.calls[0]);
  });

  it("erbjuder ingen start när Skicka inte skulle bygga", async () => {
    const onCreateChat = vi.fn(async () => true);
    render(<ChatInterface chatId={null} onCreateChat={onCreateChat} />);
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: "Beskriv vad du vill bygga" }), {
        target: { value: "   " },
      });
    });
    expect(getWelcomeComposerSnapshot().start).toBeNull();
  });

  it("publicerar inget när en chatt redan finns", () => {
    render(<ChatInterface chatId="chat_1" onSendMessage={vi.fn()} />);
    expect(getWelcomeComposerSnapshot()).toEqual({ draft: "", start: null });
  });
});
