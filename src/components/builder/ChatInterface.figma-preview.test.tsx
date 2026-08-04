/**
 * `FIGMA_ACCESS_TOKEN` is optional, so a deployment without it (including
 * production) is an expected state. This locks that the Figma input then shows a
 * neutral notice instead of a red error the user cannot act on, and that a real
 * Figma failure still surfaces as an error.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIGMA_PREVIEW_NOT_CONFIGURED } from "@/lib/api/figma-preview-contract";

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

const FIGMA_URL = "https://www.figma.com/design/file-key/Kundsajt?node-id=1-2";
const NOTICE = /Förhandsbild är inte aktiverad/;

/** Renders the open Figma input and types a valid link, then lets the debounce fire. */
async function submitFigmaUrl() {
  render(<ChatInterface chatId="chat_1" isFigmaInputOpen />);
  fireEvent.change(screen.getByPlaceholderText("Figma URL (delningslänk)"), {
    target: { value: FIGMA_URL },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
}

describe("ChatInterface — Figma-preview utan konfigurerad token", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("visar en neutral notis i stället för ett fel när servern saknar Figma-token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          success: false,
          code: FIGMA_PREVIEW_NOT_CONFIGURED,
          error: "Figma API token not configured",
        },
        { status: 400 },
      ),
    );

    await submitFigmaUrl();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.queryByText("Figma API token not configured")).toBeNull();
  });

  it("visar fortfarande riktiga Figma-fel", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: false, error: "Failed to render Figma preview" }, { status: 502 }),
    );

    await submitFigmaUrl();

    expect(screen.getByText("Failed to render Figma preview")).toBeTruthy();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
