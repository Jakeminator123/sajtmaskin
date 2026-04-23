/**
 * P19 Steg 3 — basversions-indikator.
 *
 * Focused unit test for the follow-up base badge rendered at the top of the
 * chat composer. We exercise ChatInterface directly with minimal props and
 * assert that the badge shows when `followUpBaseInfo` is supplied and stays
 * hidden otherwise. Mounting ChatInterface pulls in heavy builder
 * dependencies, so we mock the ones that need a DOM/browser runtime.
 */
import { render, screen } from "@testing-library/react";
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

vi.mock("@/components/builder/UnifiedElementPicker", () => ({
  UnifiedElementPicker: () => null,
}));

vi.mock("@/components/builder/UiElementPicker", () => ({
  PLACEMENT_OPTIONS: [],
}));

import { ChatInterface } from "./ChatInterface";

describe("ChatInterface follow-up base badge (P19 Steg 3)", () => {
  it("does not render the badge when the user is on the latest version", () => {
    render(<ChatInterface chatId="chat_1" />);
    expect(screen.queryByTestId("followup-base-badge")).toBeNull();
  });

  it("renders the badge with both labels when editing a non-latest base", () => {
    render(
      <ChatInterface
        chatId="chat_1"
        followUpBaseInfo={{ baseLabel: "v2", latestLabel: "v5" }}
      />,
    );
    const badge = screen.getByTestId("followup-base-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain("v2");
    expect(badge.textContent).toContain("v5");
    expect(badge.getAttribute("role")).toBe("status");
  });

  it("falls back to short id labels when version numbers are unknown", () => {
    // BuilderShellContent builds the labels upstream; this test locks in
    // that ChatInterface renders whatever it receives verbatim so the
    // short-id fallback is surfaced to the user rather than silently
    // dropped.
    render(
      <ChatInterface
        chatId="chat_1"
        followUpBaseInfo={{ baseLabel: "#ab12cd", latestLabel: "#ef34gh" }}
      />,
    );
    const badge = screen.getByTestId("followup-base-badge");
    expect(badge.textContent).toContain("#ab12cd");
    expect(badge.textContent).toContain("#ef34gh");
  });
});
