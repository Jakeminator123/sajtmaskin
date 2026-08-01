import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Controllable stand-in for the URL params the component reads via
// `useSearchParams` (template entries suppress the onboarding welcome).
const searchParamsMock = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.current,
}));

import { PreviewPanelEmptyState } from "./PreviewPanelEmptyState";
import { beginF3Finalize, resetF3FinalizeActivity } from "@/lib/builder/repair-blocked";

const FIX_LABEL = "Försök reparera preview";
const WELCOME_TITLE = "Vad vill du bygga?";

function renderEmptyState(
  props: Partial<React.ComponentProps<typeof PreviewPanelEmptyState>> = {},
) {
  return render(
    <PreviewPanelEmptyState
      // `undefined` → default; explicit `null` must pass through (empty start).
      chatId={props.chatId === undefined ? "chat_1" : props.chatId}
      versionId={props.versionId === undefined ? "ver_1" : props.versionId}
      externalLoading={props.externalLoading ?? false}
      awaitingInput={props.awaitingInput ?? false}
      awaitingInputOptions={props.awaitingInputOptions ?? []}
      previewPending={props.previewPending ?? false}
      onFixPreview={props.onFixPreview ?? vi.fn()}
      isGenerating={props.isGenerating ?? false}
    />,
  );
}

afterEach(() => {
  resetF3FinalizeActivity();
  searchParamsMock.current = new URLSearchParams();
});

describe("PreviewPanelEmptyState — reparationsgrind", () => {
  it("erbjuder reparation när inget annat pågår", () => {
    renderEmptyState();
    expect(screen.getByRole("button", { name: FIX_LABEL })).toBeTruthy();
  });

  it("döljer reparationen under en generering", () => {
    renderEmptyState({ isGenerating: true });
    expect(screen.queryByRole("button", { name: FIX_LABEL })).toBeNull();
  });

  // Deterministisk /finalize-design kör helt utan chat-stream: `isGenerating`
  // är falsk hela tiden, så grinden måste komma från den delade signalen.
  it("döljer reparationen under en deterministisk /finalize-design", () => {
    const release = beginF3Finalize();
    try {
      renderEmptyState({ isGenerating: false });
      expect(screen.queryByRole("button", { name: FIX_LABEL })).toBeNull();
    } finally {
      act(() => release());
    }
  });
});

// Template-spåret: mallen bestämmer redan byggvalen, så onboarding-vyn får
// inte blinka förbi medan chatten initieras (prod-observation 2026-08-01).
describe("PreviewPanelEmptyState — template-entry", () => {
  it("visar onboarding-reglagen vid tom start utan templateId", () => {
    renderEmptyState({ chatId: null, versionId: null });
    expect(screen.getByText(WELCOME_TITLE)).toBeTruthy();
  });

  it("visar laddläge i stället för onboarding när templateId finns i URL:en trots !chatId", () => {
    searchParamsMock.current = new URLSearchParams("project=proj_1&templateId=tmpl_1");
    renderEmptyState({ chatId: null, versionId: null });
    expect(screen.queryByText(WELCOME_TITLE)).toBeNull();
    expect(screen.getByText("Läser in mallen")).toBeTruthy();
    // No chat exists yet — the repair action must not be offered.
    expect(screen.queryByRole("button", { name: FIX_LABEL })).toBeNull();
  });

  it("ignorerar templateId när chatten redan hydrerats", () => {
    searchParamsMock.current = new URLSearchParams("project=proj_1&templateId=tmpl_1");
    renderEmptyState({ chatId: "chat_1", versionId: "ver_1" });
    expect(screen.queryByText("Läser in mallen")).toBeNull();
  });
});
