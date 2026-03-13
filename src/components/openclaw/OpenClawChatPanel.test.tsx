import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OpenClawChatPanel } from "./OpenClawChatPanel";

vi.mock("./useOpenClawChat", () => ({
  useOpenClawChat: () => ({
    messages: [],
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
  }),
}));

describe("OpenClawChatPanel", () => {
  it("uses viewport-clamped sizing classes for narrow screens", () => {
    const { container } = render(<OpenClawChatPanel onClose={vi.fn()} />);
    const panel = container.firstElementChild as HTMLElement | null;

    expect(panel).toBeTruthy();
    expect(panel?.className).toContain("w-[min(380px,calc(100vw-1rem))]");
    expect(panel?.className).toContain("max-w-[calc(100vw-1rem)]");
    expect(panel?.className).toContain("h-[min(500px,calc(100vh-7rem))]");
  });
});
