import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const searchParamsMock = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.current,
}));

import { PreviewPanelEmptyState } from "./PreviewPanelEmptyState";
import {
  installIntersectionObserver,
  type FakeIntersectionObserver,
} from "./PreviewBackdrop.test-support";
import { resetF3FinalizeActivity } from "@/lib/builder/repair-blocked";

const FIX_LABEL = "Försök reparera preview";
const PAUSE_LABEL = "Pausa bakgrunden";

function renderEmptyState(
  props: Partial<React.ComponentProps<typeof PreviewPanelEmptyState>> = {},
) {
  return render(
    <PreviewPanelEmptyState
      chatId={props.chatId === undefined ? "chat_1" : props.chatId}
      versionId={props.versionId === undefined ? "ver_1" : props.versionId}
      externalLoading={props.externalLoading ?? false}
      awaitingInput={props.awaitingInput ?? false}
      awaitingInputQuestion={props.awaitingInputQuestion}
      awaitingInputOptions={props.awaitingInputOptions ?? []}
      previewPending={props.previewPending ?? false}
      previewBuildError={props.previewBuildError}
      onFixPreview={props.onFixPreview ?? vi.fn()}
      isGenerating={props.isGenerating ?? false}
    />,
  );
}

let observer: FakeIntersectionObserver;

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  observer = installIntersectionObserver({ initial: true });
});

afterEach(() => {
  observer.restore();
  vi.restoreAllMocks();
  resetF3FinalizeActivity();
  searchParamsMock.current = new URLSearchParams();
});

describe("PreviewPanelEmptyState — Moving Background 2", () => {
  it("lägger scenen i välkomstläget utan att svälja byggvalen", () => {
    const { container } = renderEmptyState({ chatId: null, versionId: null });
    expect(screen.getByText("Vad vill du bygga?")).toBeTruthy();
    const video = container.querySelector("video");
    expect(video).toBeTruthy();

    // Dekorationen är ett eget `aria-hidden` + `pointer-events-none`-lager, och
    // inget riktigt reglage ligger inuti det. Ett RTL-klick skulle vara grönt
    // även med videon ovanpå, så trädet är det som kontrolleras här.
    const decoration = video!.parentElement!;
    expect(decoration.getAttribute("aria-hidden")).toBe("true");
    expect(decoration.className).toContain("pointer-events-none");

    const choices = screen.getAllByRole("radio");
    expect(choices.length).toBeGreaterThan(1);
    for (const choice of choices) {
      expect(decoration.contains(choice)).toBe(false);
    }
    fireEvent.click(choices[0]!);
    expect(choices[0]!.getAttribute("data-state")).toBe("on");
  });

  it("lägger scenen bakom den faktiska statusen medan VM:en startar", () => {
    const { container } = renderEmptyState({ previewPending: true });
    const status = screen.getByText("Startar VM-preview");
    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    expect(video!.parentElement!.contains(status)).toBe(false);
  });

  // Ett statusbyte är presentation. Det får aldrig trigga en debiterad körning.
  it("startar ingen reparation när statusen byts", () => {
    const onFixPreview = vi.fn();
    const { rerender } = renderEmptyState({ onFixPreview });
    rerender(
      <PreviewPanelEmptyState
        chatId="chat_1"
        versionId="ver_1"
        externalLoading={false}
        awaitingInput={false}
        awaitingInputOptions={[]}
        previewPending
        onFixPreview={onFixPreview}
        isGenerating={false}
      />,
    );
    expect(screen.getByText("Startar VM-preview")).toBeTruthy();
    expect(onFixPreview).not.toHaveBeenCalled();
  });

  it("behåller den kvarliggande frågan och svarsalternativen i statuskortet", () => {
    renderEmptyState({
      awaitingInput: true,
      awaitingInputQuestion: "Ska besökare boka tid eller kontakta dig?",
      awaitingInputOptions: ["Boka tid", "Kontakta"],
    });
    expect(screen.getByText("AI väntar på ditt svar")).toBeTruthy();
    expect(screen.getByText("Ska besökare boka tid eller kontakta dig?")).toBeTruthy();
    expect(screen.getByText("Boka tid")).toBeTruthy();
  });

  // Verkligt fel: stillbild + synlig åtgärd. Scenen får inte konkurrera med
  // diagnostiken, och videoresurserna ska inte ens begäras.
  it("fryser bakgrunden till stillbild vid ett blockerande fel och behåller åtgärden", () => {
    const { container } = renderEmptyState({
      previewBuildError: { stage: "runtime_start_failed", message: "VM:en startade inte." },
    });
    expect(screen.getByText("VM:en startade inte.")).toBeTruthy();
    expect(screen.getByRole("button", { name: FIX_LABEL })).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toBeTruthy();
    expect(screen.queryByRole("button", { name: PAUSE_LABEL })).toBeNull();
  });

  // `info` är en notis om något pipelinen inte kunde verifiera, inte ett fel.
  it("låter scenen röra sig vid en info-notis", () => {
    const { container } = renderEmptyState({
      previewBuildError: {
        stage: "preview-unverified",
        message: "Sidan renderas i klienten och kunde inte verifieras.",
        severity: "info",
      },
    });
    expect(container.querySelector("video")).toBeTruthy();
  });
});
