/**
 * Lugnare inmatning (UX-granskningen 2026-11-11, C2): huvudytan har textfält,
 * bilaga, lägesväljare, mottagaretikett och Skicka. Övriga verktyg ligger i
 * EN rad bakom «Verktyg». Ingen funktion är borttagen.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SajtagentContextValue } from "./sajtagent/SajtagentProvider";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));
vi.mock("@/components/forms/voice-recorder", () => ({
  VoiceRecorder: () => <button type="button">Röstinspelning</button>,
}));
vi.mock("@/components/media/file-upload-zone", () => ({
  FileUploadZone: () => <button type="button">Lägg till media</button>,
  filesToAttachments: () => [],
  filesToPromptText: () => "",
}));
vi.mock("@/components/media/media-drawer", () => ({ MediaDrawer: () => null }));
vi.mock("@/components/media/text-uploader", () => ({ TextUploader: () => null }));
vi.mock("@/components/openclaw/OpenClawPowersControl", () => ({
  OpenClawPowersControl: () => null,
}));

const sajtagent = vi.hoisted(() => ({ value: null as SajtagentContextValue | null }));
vi.mock("./sajtagent/SajtagentProvider", () => ({
  useSajtagent: () => sajtagent.value,
}));

import { ChatInterface } from "./ChatInterface";

function makeAgent(): SajtagentContextValue {
  return {
    available: true,
    configured: true,
    messages: [],
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
    armedMandate: null,
    campaignScript: null,
  };
}

const previewModes = (overrides: Partial<{ composerOpen: boolean; inspectOpen: boolean }> = {}) => ({
  composerOpen: false,
  onToggleComposer: vi.fn(),
  inspectAvailable: true,
  inspectOpen: false,
  onToggleInspect: vi.fn(),
  ...overrides,
});

afterEach(() => {
  sajtagent.value = null;
  vi.clearAllMocks();
});

describe("ChatInterface — lugnare inmatning", () => {
  it("visar bara textfält, bilaga, läge, mottagare och Skicka tills Verktyg fälls ut", () => {
    sajtagent.value = makeAgent();
    render(
      <ChatInterface
        chatId="chat_1"
        mediaEnabled
        previewModes={previewModes()}
        selectedModelTier="pro"
        onSelectedModelTierChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Skriv en uppdatering" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lägg till media" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Mottagare för nästa meddelande" })).toBeTruthy();
    expect(screen.getByTestId("composer-route-hint")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skicka" })).toBeTruthy();

    for (const name of ["Plan", "Förbättra texten", "Lägg till block", "Inspektera preview", "Media", "Text/PDF", "Röstinspelning"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("fäller ut och ihop alla sekundära verktyg utan att ta bort någon funktion", () => {
    render(
      <ChatInterface
        chatId="chat_1"
        mediaEnabled
        previewModes={previewModes()}
        selectedModelTier="pro"
        onSelectedModelTierChange={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Verktyg" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const rowId = toggle.getAttribute("aria-controls");
    expect(rowId).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const row = screen.getByRole("group", { name: "Fler verktyg" });
    expect(row.id).toBe(rowId);
    for (const name of ["Plan", "Förbättra texten", "Lägg till block", "Inspektera preview", "Media", "Text/PDF", "Röstinspelning"]) {
      expect(within(row).getByRole("button", { name })).toBeTruthy();
    }

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "Fler verktyg" })).toBeNull();
  });

  it("nås med tangentbordet: Verktyg är en vanlig knapp i tabbordningen", () => {
    render(<ChatInterface chatId="chat_1" previewModes={previewModes()} />);
    const toggle = screen.getByRole("button", { name: "Verktyg" });
    act(() => toggle.focus());
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.hasAttribute("tabindex")).toBe(false);
  });

  it("fäller ut raden när ett previewläge slås på, och markerar det när raden fälls ihop", () => {
    const { rerender } = render(<ChatInterface chatId="chat_1" previewModes={previewModes()} />);
    expect(screen.queryByTestId("composer-tools-active-dot")).toBeNull();

    rerender(<ChatInterface chatId="chat_1" previewModes={previewModes({ inspectOpen: true })} />);
    const toggle = screen.getByRole("button", { name: "Verktyg" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Sluta inspektera" })).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.getByTestId("composer-tools-active-dot")).toBeTruthy();
  });
});
