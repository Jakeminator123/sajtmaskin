import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The bridge reads `NEXT_PUBLIC_AVATAR_*` into module-level constants at import
// time, so each scenario stubs the env and re-imports the component fresh.
async function loadBridge() {
  vi.resetModules();
  const mod = await import("./did-openclaw-bridge");
  return mod.DidOpenClawBridge;
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("DidOpenClawBridge avatar-disabled text-chat fallback", () => {
  it("keeps text chat usable when the flag is OFF but D-ID keys are present", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_AGENT_ID", "v2_agt_test");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_CLIENT_KEY", "client-key");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "");

    const DidOpenClawBridge = await loadBridge();
    render(<DidOpenClawBridge />);

    // The chat input + send + message list must remain mounted: disabling the
    // avatar should degrade to text chat, not remove it (Codex P2 #212).
    expect(screen.queryByTestId("avatar-bridge-input")).toBeTruthy();
    expect(screen.queryByTestId("avatar-bridge-send")).toBeTruthy();
    expect(screen.queryByTestId("avatar-bridge-last-assistant")).toBeTruthy();

    // A non-blocking notice explains the avatar is off; the avatar video/connect
    // affordances are hidden, but chat stays alive.
    expect(screen.queryByTestId("avatar-bridge-notice")).toBeTruthy();
    expect(screen.queryByTestId("avatar-bridge-video-disabled")).toBeTruthy();
    expect(screen.queryByTestId("avatar-bridge-connect")).toBeNull();
  });

  it.each([undefined, "owned-chat"])("uses the matching image bank for avatar chat %s", async (chatId) => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "");
    const reason = chatId
      ? "Sajten har nått gränsen på 200 bilder och logotyper."
      : "Ditt personliga utrymme har nått gränsen på 200 bilder och logotyper.";
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ success: false, error: reason }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ success: true, items: [{
        id: 42, url: "https://files.public.blob.vercel-storage.com/owner/media/chair.png",
        filename: "tidigare.png", mimeType: "image/png", fileType: "image",
        createdAt: "2026-11-27T00:00:00.000Z",
      }] }))
      .mockResolvedValueOnce(Response.json({ success: true, reply: "En stol." }));
    vi.stubGlobal("fetch", mockFetch);
    const DidOpenClawBridge = await loadBridge();
    const view = render(<DidOpenClawBridge chatId={chatId} />);
    fireEvent.click(screen.getByText("Bilagor till frågan"));
    const upload = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(upload, { target: { files: [new File(["image"], "ny.png", { type: "image/png" })] } });
    await screen.findByText(reason);
    expect(mockFetch.mock.calls[0]?.[0]).toBe("/api/media/upload");
    const uploadBody = mockFetch.mock.calls[0]?.[1].body as FormData;
    expect(uploadBody.get("chatId")).toBe(chatId ?? null);
    expect(uploadBody.get("projectId")).toBeNull();
    expect(uploadBody.get("mediaScope")).toBe(chatId ? "media-library" : null);
    fireEvent.change(screen.getByTestId("avatar-bridge-input"), { target: { value: "Sök på webben efter modellen på bilden." } });
    expect(screen.getByTestId<HTMLButtonElement>("avatar-bridge-send").disabled).toBe(true);
    fireEvent.click(screen.getByTestId("avatar-bridge-send"));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Ta bort ny.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Välj från mediebanken" }));
    fireEvent.click(await screen.findByAltText("tidigare.png"));
    const listUrl = new URL(mockFetch.mock.calls[1]?.[0], "http://localhost");
    expect(listUrl.pathname).toBe("/api/media/upload");
    expect(listUrl.searchParams.get("chatId")).toBe(chatId ?? null);
    fireEvent.click(screen.getByTestId("avatar-bridge-send"));
    await waitFor(() => expect(screen.getAllByTestId("avatar-bridge-last-assistant")
      .some((node) => node.textContent?.includes("En stol."))).toBe(true));
    expect(mockFetch.mock.calls[2]?.[0]).toBe("/api/did/chat");
    expect(JSON.parse(mockFetch.mock.calls[2]?.[1].body)).toMatchObject({ readTask: { search: true, attachmentIds: [42] } });
  });

  it("opens one page from a typed request, then sends the rights-approved imported image for vision", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(Response.json({
        url: "https://www.minbil.se/", title: "Min bil", passages: ["Textstycke Y"],
        images: [{ url: "https://cdn.example.org/photo", alt: "Bild X" }],
      }))
      .mockResolvedValueOnce(Response.json({
        media: { id: 43, url: "https://files.public.blob.vercel-storage.com/owner/media/photo.png",
          filename: "photo.png", contentType: "image/png", storageType: "blob" },
      }))
      .mockResolvedValueOnce(Response.json({ success: true, reply: "Jag ser bilden." }));
    vi.stubGlobal("fetch", mockFetch);
    const DidOpenClawBridge = await loadBridge();
    render(<DidOpenClawBridge chatId="owned-chat" />);
    fireEvent.change(screen.getByTestId("avatar-bridge-input"), { target: {
      value: "Kan du gå till www.minbil.se och hämta bild X och textstycke Y?",
    } });
    fireEvent.click(screen.getByTestId("avatar-bridge-send"));
    await screen.findByText("Min bil");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toBe("/api/openclaw/source-page");
    fireEvent.change(screen.getByLabelText("Textstycke"), { target: { value: "Textstycke Y" } });
    fireEvent.change(screen.getByLabelText("Bild"), { target: { value: "https://cdn.example.org/photo" } });
    fireEvent.click(screen.getByLabelText("Jag får återanvända bilden"));
    fireEvent.click(screen.getByRole("button", { name: "Använd i utkastet" }));
    await screen.findByText("Vald källa https://www.minbil.se/");
    expect(mockFetch.mock.calls[1]?.[0]).toBe("/api/media/upload-from-url");
    expect(JSON.parse(mockFetch.mock.calls[1]?.[1].body)).toMatchObject({ chatId: "owned-chat" });

    fireEvent.click(screen.getByTestId("avatar-bridge-send"));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    expect(mockFetch.mock.calls[2]?.[0]).toBe("/api/did/chat");
    expect(JSON.parse(mockFetch.mock.calls[2]?.[1].body)).toMatchObject({
      readTask: { attachmentIds: [43], source: { url: "https://www.minbil.se/", passage: "Textstycke Y" } },
    });
    expect(JSON.parse(mockFetch.mock.calls[2]?.[1].body).readTask.search).toBeUndefined();
  });

  it("keeps text chat usable when the flag is ON but a key is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_AGENT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_CLIENT_KEY", "client-key");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "1");

    const DidOpenClawBridge = await loadBridge();
    render(<DidOpenClawBridge />);

    expect(screen.queryByTestId("avatar-bridge-input")).toBeTruthy();
    expect(screen.queryByTestId("avatar-bridge-send")).toBeTruthy();
    expect(screen.queryByTestId("avatar-bridge-notice")).toBeTruthy();
    expect(screen.queryByTestId("avatar-bridge-connect")).toBeNull();
  });

  it("exposes the avatar connect affordance when the flag is ON and both keys are present", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_AGENT_ID", "v2_agt_test");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_CLIENT_KEY", "client-key");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "1");

    const DidOpenClawBridge = await loadBridge();
    render(<DidOpenClawBridge />);

    // Active path is unchanged: chat + connect button, no disabled notice.
    expect(screen.queryByTestId("avatar-bridge-input")).toBeTruthy();
    expect(screen.queryByTestId("avatar-bridge-connect")).toBeTruthy();
    expect(screen.queryByTestId("avatar-bridge-notice")).toBeNull();
    expect(screen.queryByTestId("avatar-bridge-video-disabled")).toBeNull();
  });
});
