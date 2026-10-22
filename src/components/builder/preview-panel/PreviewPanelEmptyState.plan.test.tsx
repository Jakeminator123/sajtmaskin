import { render, screen } from "@testing-library/react";
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

function renderEmptyState(
  props: Partial<React.ComponentProps<typeof PreviewPanelEmptyState>> = {},
) {
  return render(
    <PreviewPanelEmptyState
      chatId={props.chatId === undefined ? "chat_1" : props.chatId}
      versionId={props.versionId === undefined ? null : props.versionId}
      externalLoading={props.externalLoading ?? false}
      awaitingInput={props.awaitingInput ?? false}
      awaitingInputQuestion={props.awaitingInputQuestion}
      awaitingInputOptions={props.awaitingInputOptions ?? []}
      awaitingPlanApproval={props.awaitingPlanApproval ?? false}
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

describe("PreviewPanelEmptyState — plan awaiting approval (2026-10-22)", () => {
  it("visar ett väntande tillstånd i stället för felet «Preview saknas»", () => {
    renderEmptyState({ awaitingPlanApproval: true });
    expect(screen.getByText("Planen väntar på ditt godkännande")).toBeTruthy();
    expect(screen.getByText(/Godkänn plan och bygg/)).toBeTruthy();
    expect(screen.queryByText("Ingen förhandsvisning ännu")).toBeNull();
    expect(screen.queryByText(/Preview saknas för senaste versionen/)).toBeNull();
    expect(screen.queryByRole("button", { name: FIX_LABEL })).toBeNull();
  });

  it("utan plan är felet och reparationsknappen oförändrade", () => {
    renderEmptyState({ awaitingPlanApproval: false });
    expect(screen.getByText("Ingen förhandsvisning ännu")).toBeTruthy();
    expect(screen.getByRole("button", { name: FIX_LABEL })).toBeTruthy();
  });

  it("en direkt fråga från AI vinner över planläget", () => {
    renderEmptyState({
      awaitingPlanApproval: true,
      awaitingInput: true,
      awaitingInputQuestion: "Vilken stil vill du ha?",
      awaitingInputOptions: ["Ljus", "Mörk"],
    });
    expect(screen.getByText("AI väntar på ditt svar")).toBeTruthy();
    expect(screen.getByText("Vilken stil vill du ha?")).toBeTruthy();
    expect(screen.queryByText("Planen väntar på ditt godkännande")).toBeNull();
    expect(screen.queryByRole("button", { name: FIX_LABEL })).toBeNull();
  });

  it("ett verkligt byggfel vinner över planläget", () => {
    renderEmptyState({
      awaitingPlanApproval: true,
      previewBuildError: { severity: "error", stage: "build", message: "Bygget misslyckades." } as never,
    });
    expect(screen.queryByText("Planen väntar på ditt godkännande")).toBeNull();
    expect(screen.getByText("Bygget misslyckades.")).toBeTruthy();
  });
});
