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

import { ChatInterface } from "./ChatInterface";

describe("ChatInterface follow-up base badge (P19 Steg 3)", () => {
  it("does not render the badge when the user is on the preferred version", () => {
    render(<ChatInterface chatId="chat_1" />);
    expect(screen.queryByTestId("followup-base-badge")).toBeNull();
  });

  it("renders the badge with both labels when editing a non-preferred base", () => {
    render(
      <ChatInterface
        chatId="chat_1"
        followUpBaseInfo={{
          baseLabel: "v2",
          preferredLabel: "v5",
          kind: "stale-selection",
        }}
      />,
    );
    const badge = screen.getByTestId("followup-base-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain("v2");
    expect(badge.textContent).toContain("v5");
    expect(badge.textContent).toContain("nyare fungerande version");
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
        followUpBaseInfo={{
          baseLabel: "#ab12cd",
          preferredLabel: "#ef34gh",
          kind: "stale-selection",
        }}
      />,
    );
    const badge = screen.getByTestId("followup-base-badge");
    expect(badge.textContent).toContain("#ab12cd");
    expect(badge.textContent).toContain("#ef34gh");
  });

  it("explains a rejected active version without calling it senaste", () => {
    render(
      <ChatInterface
        chatId="chat_1"
        followUpBaseInfo={{
          baseLabel: "v2",
          preferredLabel: "v1",
          kind: "rejected-active",
        }}
      />,
    );
    const badge = screen.getByTestId("followup-base-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain("v2");
    expect(badge.textContent).toContain("v1");
    expect(badge.textContent).toContain("inte gick att bygga");
    expect(badge.textContent).toContain("senaste som fungerade");
    // Must not call the rejected active version "senaste".
    expect(badge.textContent).not.toMatch(/inte senaste\s+v2/);
    expect(badge.textContent).not.toMatch(/senaste\s+v2/);
  });

  it("still renders when active version number is higher than preferred (regression)", () => {
    // Guard against hiding the banner when active > preferred — that would
    // silence a legitimate warning while follow-ups keep building on a
    // rejected base (false-green).
    render(
      <ChatInterface
        chatId="chat_1"
        followUpBaseInfo={{
          baseLabel: "v3",
          preferredLabel: "v1",
          kind: "rejected-active",
        }}
      />,
    );
    expect(screen.getByTestId("followup-base-badge")).toBeTruthy();
    expect(screen.getByTestId("followup-base-badge").textContent).toContain("v3");
    expect(screen.getByTestId("followup-base-badge").textContent).toContain("v1");
  });
});
