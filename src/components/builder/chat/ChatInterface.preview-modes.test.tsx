/**
 * Spår 04 — `Lägg till block` och `Inspektera preview` flyttade från
 * previewpanelens verktygsrad till chatpanelens Verktyg-rad. Testet låser att
 * de renderas där, att de speglar lägena de styr, och att de INTE finns kvar i
 * previewpanelen (två knappar mot ett läge är värre än ingen).
 */
import { fireEvent, render, screen } from "@testing-library/react";
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
import { PreviewPanel } from "../preview-panel/PreviewPanel";

function buildPreviewModes(
  overrides?: Partial<NonNullable<React.ComponentProps<typeof ChatInterface>["previewModes"]>>,
) {
  return {
    composerOpen: false,
    onToggleComposer: vi.fn(),
    inspectAvailable: true,
    inspectOpen: false,
    onToggleInspect: vi.fn(),
    ...overrides,
  };
}

describe("ChatInterface — previewlägen i Verktyg-raden", () => {
  it("renderar Lägg till block och Inspektera preview bredvid Plan", () => {
    render(<ChatInterface chatId="chat_1" previewModes={buildPreviewModes()} />);

    // "Avancerat"-popovern togs bort 2026-07-31: när temaväljaren flyttade
    // till Byggval-reglagen blev popovern en enda-knapps-meny (bara "Plan"),
    // så Plan renderas nu som en vanlig verktygsknapp utan popover-omslag.
    expect(screen.getByRole("button", { name: "Plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lägg till block" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Inspektera preview" })).toBeTruthy();
  });

  it("bär ägarbeslutets tooltip på Lägg till block", () => {
    render(<ChatInterface chatId="chat_1" previewModes={buildPreviewModes()} />);

    expect(screen.getByRole("button", { name: "Lägg till block" }).getAttribute("title")).toBe(
      "Lägg till färdiga block och innehåll i previewen",
    );
  });

  it("visar stängt läge och pressed-state när composern är öppen", () => {
    render(
      <ChatInterface chatId="chat_1" previewModes={buildPreviewModes({ composerOpen: true })} />,
    );

    const button = screen.getByRole("button", { name: "Stäng block" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Lägg till block" })).toBeNull();
  });

  it("anropar ägarens togglar", () => {
    const modes = buildPreviewModes();
    render(<ChatInterface chatId="chat_1" previewModes={modes} />);

    fireEvent.click(screen.getByRole("button", { name: "Lägg till block" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspektera preview" }));

    expect(modes.onToggleComposer).toHaveBeenCalledTimes(1);
    expect(modes.onToggleInspect).toHaveBeenCalledTimes(1);
  });

  it("döljer Inspektera preview när inspektorn är avstängd", () => {
    render(
      <ChatInterface
        chatId="chat_1"
        previewModes={buildPreviewModes({ inspectAvailable: false })}
      />,
    );

    expect(screen.queryByRole("button", { name: "Inspektera preview" })).toBeNull();
  });

  it("renderar ingen av knapparna utan preview att styra", () => {
    render(<ChatInterface chatId="chat_1" />);

    expect(screen.queryByRole("button", { name: "Lägg till block" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Inspektera preview" })).toBeNull();
  });

  it("previewpanelen har inga egna knappar för lägena kvar", () => {
    render(
      <PreviewPanel
        chatId="chat_1"
        versionId="ver_1"
        previewUrl="https://preview.example/ver_1"
      />,
    );

    expect(screen.queryByRole("button", { name: /Lägg till block/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Inspektera preview/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Kod$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Rensa$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Öppna$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Byggblock/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Bygg integrationer/i })).toBeNull();
  });
});
