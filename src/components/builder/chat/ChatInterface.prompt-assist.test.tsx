import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/components/forms/voice-recorder", () => ({
  VoiceRecorder: () => null,
}));

vi.mock("@/components/media/file-upload-zone", () => ({
  FileUploadZone: () => null,
  filesToAttachments: () => [],
  filesToPromptText: () => "",
}));

vi.mock("@/components/media/media-drawer", () => ({
  MediaDrawer: () => null,
}));

vi.mock("@/components/media/text-uploader", () => ({
  TextUploader: () => null,
}));

vi.mock("@/lib/hooks/useIntegrationStatus", () => ({
  useIntegrationStatus: () => ({ integrationStatus: null, integrationError: null }),
}));

import { ChatInterface } from "./ChatInterface";

describe("ChatInterface — Förbättra texten (Prompt-assist)", () => {
  it("sits beside Plan and writes the draft back without sending", async () => {
    const onSendMessage = vi.fn();
    const onCreateChat = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "En café-sajt i Malmö utan betalningar" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ChatInterface
        chatId={null}
        initialPrompt="cafe malmo"
        onSendMessage={onSendMessage}
        onCreateChat={onCreateChat}
      />,
    );

    const assist = screen.getByRole("button", { name: "Förbättra texten" });
    expect(screen.getByRole("button", { name: "Plan" })).toBeTruthy();
    expect(assist.getAttribute("title")).toBe("Rätta och strukturera utkastet utan att skicka");

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "en cafe sida i malmo, inga betalningar" },
    });
    fireEvent.click(assist);

    await waitFor(() => {
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
        "En café-sajt i Malmö utan betalningar",
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/prompt-assist",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ draft: "en cafe sida i malmo, inga betalningar" }),
      }),
    );
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(onCreateChat).not.toHaveBeenCalled();
  });
});
