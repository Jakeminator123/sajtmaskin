import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenClawChatPanel } from "./OpenClawChatPanel";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";

vi.mock("./useOpenClawChat", () => ({
  useOpenClawChat: () => ({
    messages: [],
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
  }),
}));

beforeEach(() => {
  // The panel's mount effect fetches /api/openclaw/health and writes the store.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ debugEnabled: false, editEnabled: true }),
    })),
  );
  act(() => {
    useOpenClawStore.setState({ editEnabled: false, powersOn: false, grantedPowers: [] });
  });
});

describe("OpenClawChatPanel", () => {
  it("uses viewport-clamped sizing classes for narrow screens", () => {
    const { container } = render(<OpenClawChatPanel onClose={vi.fn()} />);
    const panel = container.firstElementChild as HTMLElement | null;

    expect(panel).toBeTruthy();
    expect(panel?.className).toContain("w-[min(380px,calc(100vw-1rem))]");
    expect(panel?.className).toContain("max-w-[calc(100vw-1rem)]");
    expect(panel?.className).toContain("h-[min(640px,calc(100vh-5rem))]");
  });

  // Extra powers can only act where the builder composer/versions exist, so the
  // control is opt-in per surface: absent by default (landing, kostnadsfri),
  // present only when the builder mounts the panel with powersAvailable.
  it("hides the powers control unless the surface makes it available", async () => {
    render(<OpenClawChatPanel onClose={vi.fn()} />);
    await waitFor(() => {
      expect(useOpenClawStore.getState().editEnabled).toBe(true);
    });
    expect(screen.queryByRole("button", { name: "Slå på extra befogenheter" })).toBeNull();
  });

  it("shows the powers control on a builder surface with OC_EDIT on", async () => {
    render(<OpenClawChatPanel onClose={vi.fn()} powersAvailable />);
    expect(
      await screen.findByRole("button", { name: "Slå på extra befogenheter" }),
    ).toBeTruthy();
  });
});
