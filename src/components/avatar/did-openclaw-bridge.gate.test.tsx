import { cleanup, render, screen } from "@testing-library/react";
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
