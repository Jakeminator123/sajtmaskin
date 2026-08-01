import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelEmptyState } from "./PreviewPanelEmptyState";
import { beginF3Finalize, resetF3FinalizeActivity } from "@/lib/builder/repair-blocked";

const FIX_LABEL = "Försök reparera preview";

function renderEmptyState(
  props: Partial<React.ComponentProps<typeof PreviewPanelEmptyState>> = {},
) {
  return render(
    <PreviewPanelEmptyState
      chatId={props.chatId ?? "chat_1"}
      versionId={props.versionId ?? "ver_1"}
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
