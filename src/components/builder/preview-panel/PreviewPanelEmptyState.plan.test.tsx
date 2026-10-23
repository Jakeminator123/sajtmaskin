import { render, renderHook, screen } from "@testing-library/react";
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
import { useBuilderDerivedState } from "@/app/builder/useBuilderDerivedState";
import type { ChatMessage } from "@/lib/builder/types";

const FIX_LABEL = "Försök reparera preview";

function renderMessageState(messages: ChatMessage[]) {
  const { result } = renderHook(() => useBuilderDerivedState({
    chatId: "chat_1", messages, selectedVersionId: null, chat: null, versions: [],
    templateId: null, resolvedPrompt: null, auditPromptLoaded: true,
    isMediaEnabled: false, enableBlobMedia: false,
  }));
  return renderEmptyState({
    awaitingInput: result.current.isAwaitingInput,
    awaitingPlanApproval: result.current.isAwaitingPlanApproval,
  });
}

const readyPlanMessage: ChatMessage = {
  id: "plan", role: "assistant", content: "Plan",
  uiParts: [{ type: "plan", plan: { awaitingInput: false, raw: { blockers: [] } } }],
};

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
      versionlessAborted={props.versionlessAborted}
      onRestartGeneration={props.onRestartGeneration}
      previewLifecycle={props.previewLifecycle}
      activeVersionStatus={props.activeVersionStatus}
      activeVersionIsLatest={props.activeVersionIsLatest}
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
  it("en äldre obesvarad fråga håller preview väntande utan reparation", () => {
    renderMessageState([
      { id: "question", role: "assistant", content: "Question",
        uiParts: [{ type: "tool-custom", state: "approval-requested" }] },
      readyPlanMessage,
    ]);
    expect(screen.getByText("AI väntar på ditt svar")).toBeTruthy();
    expect(screen.queryByText("Planen väntar på ditt godkännande")).toBeNull();
    expect(screen.queryByRole("button", { name: FIX_LABEL })).toBeNull();
  });

  it("en senare assistentrad konsumerar inte chattens godkännandeknapp", () => {
    renderMessageState([
      readyPlanMessage,
      { id: "answer", role: "assistant", content: "More information" },
    ]);
    expect(screen.getByText("Planen väntar på ditt godkännande")).toBeTruthy();
    expect(screen.queryByRole("button", { name: FIX_LABEL })).toBeNull();
  });

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
    expect(screen.getByRole("button", { name: FIX_LABEL })).toBeTruthy();
    expect(screen.queryByText(/Planen och knappen finns/)).toBeNull();
  });

  it.each([
    { versionlessAborted: true, onRestartGeneration: () => undefined },
    { previewPending: true },
    { previewLifecycle: "recovering" as const },
    { activeVersionStatus: "verifying" as const },
    { activeVersionStatus: "retrying" as const, activeVersionIsLatest: false },
    { externalLoading: true },
    { isGenerating: true },
    { versionId: "existing-version" },
  ])("visar inte planhänvisningen när ett annat tillstånd gäller: %j", (props) => {
    renderEmptyState({ awaitingPlanApproval: true, ...props });
    expect(screen.queryByText("Planen väntar på ditt godkännande")).toBeNull();
    expect(screen.queryByText(/Planen och knappen finns/)).toBeNull();
  });
});

