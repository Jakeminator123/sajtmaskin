import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewPanelFrame } from "./PreviewPanelFrame";

const SLOW_BOOT_TEXT = "Previewn tar längre tid än vanligt — startar miljön…";

function renderFrame(props: Partial<React.ComponentProps<typeof PreviewPanelFrame>> = {}) {
  return render(
    <PreviewPanelFrame
      isLoading={props.isLoading ?? true}
      iframeError={props.iframeError ?? false}
      iframeErrorMessage={props.iframeErrorMessage ?? null}
      iframeDiagnosticCode={props.iframeDiagnosticCode ?? null}
      iframeRunbookLines={props.iframeRunbookLines ?? []}
      handleOpenInNewTab={props.handleOpenInNewTab ?? vi.fn()}
      onFixPreview={props.onFixPreview}
      previewSrc={props.previewSrc ?? "https://preview.example/ver_1"}
      iframeRef={props.iframeRef ?? { current: null }}
      handleIframeLoad={props.handleIframeLoad ?? vi.fn()}
      handleIframeError={props.handleIframeError ?? vi.fn()}
    />,
  );
}

describe("PreviewPanelFrame — N6/Del C: ärligt läge efter hard-capen", () => {
  it("visar spinner-overlayen innan hard-capen och byter till en diskret rad efter", () => {
    vi.useFakeTimers();
    try {
      renderFrame();

      // Innan debounce: varken overlay eller slow-boot-rad.
      expect(screen.queryByText("Laddar...")).toBeNull();
      expect(screen.queryByText(SLOW_BOOT_TEXT)).toBeNull();

      // Efter debounce (350ms) men innan hard-capen (6000ms): overlay syns.
      act(() => vi.advanceTimersByTime(400));
      expect(screen.getByText("Laddar...")).toBeTruthy();
      expect(screen.queryByText(SLOW_BOOT_TEXT)).toBeNull();

      // Efter hard-capen: overlayen försvinner tyst, men den ärliga raden syns.
      act(() => vi.advanceTimersByTime(6_000));
      expect(screen.queryByText("Laddar...")).toBeNull();
      expect(screen.getByText(SLOW_BOOT_TEXT)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("erbjuder 'Öppna i ny flik' och 'Reparera' i den ärliga raden", () => {
    vi.useFakeTimers();
    const handleOpenInNewTab = vi.fn();
    const onFixPreview = vi.fn();
    try {
      renderFrame({ handleOpenInNewTab, onFixPreview });
      act(() => vi.advanceTimersByTime(6_100));

      fireEvent.click(screen.getByRole("button", { name: "Öppna i ny flik" }));
      expect(handleOpenInNewTab).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Reparera" }));
      expect(onFixPreview).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("döljer den ärliga raden så fort laddningen faktiskt blir klar", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderFrame({ isLoading: true });
      act(() => vi.advanceTimersByTime(6_100));
      expect(screen.getByText(SLOW_BOOT_TEXT)).toBeTruthy();

      rerender(
        <PreviewPanelFrame
          isLoading={false}
          iframeError={false}
          iframeErrorMessage={null}
          iframeDiagnosticCode={null}
          iframeRunbookLines={[]}
          handleOpenInNewTab={vi.fn()}
          previewSrc="https://preview.example/ver_1"
          iframeRef={{ current: null }}
          handleIframeLoad={vi.fn()}
          handleIframeError={vi.fn()}
        />,
      );

      expect(screen.queryByText(SLOW_BOOT_TEXT)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("låter fel-overlayen vinna i stället för att stapla den ärliga raden ovanpå", () => {
    vi.useFakeTimers();
    try {
      renderFrame({ isLoading: true, iframeError: true, iframeErrorMessage: "Iframe failed to load." });
      act(() => vi.advanceTimersByTime(6_100));

      expect(screen.getByText("Iframe failed to load.")).toBeTruthy();
      expect(screen.queryByText(SLOW_BOOT_TEXT)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
