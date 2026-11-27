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

  it("shows a failed upload without submitting and can attach an existing media-bank image", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "");
    const reason = "Max 10 bilder/logos. Ta bort någon först.";
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
    const view = render(<DidOpenClawBridge />);
    fireEvent.click(screen.getByText("Bilagor till frågan"));
    const upload = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(upload, { target: { files: [new File(["image"], "ny.png", { type: "image/png" })] } });
    await screen.findByText(reason);
    fireEvent.change(screen.getByTestId("avatar-bridge-input"), { target: { value: "Vad visar bilden?" } });
    expect(screen.getByTestId<HTMLButtonElement>("avatar-bridge-send").disabled).toBe(true);
    fireEvent.click(screen.getByTestId("avatar-bridge-send"));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Ta bort ny.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Välj från mediebanken" }));
    fireEvent.click(await screen.findByAltText("tidigare.png"));
    fireEvent.click(screen.getByTestId("avatar-bridge-send"));
    await waitFor(() => expect(screen.getAllByTestId("avatar-bridge-last-assistant")
      .some((node) => node.textContent?.includes("En stol."))).toBe(true));
    expect(mockFetch.mock.calls[2]?.[0]).toBe("/api/did/chat");
    expect(JSON.parse(mockFetch.mock.calls[2]?.[1].body)).toMatchObject({ readTask: { attachmentIds: [42] } });
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
