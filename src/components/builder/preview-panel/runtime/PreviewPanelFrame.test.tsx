import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewPanelFrame } from "./PreviewPanelFrame";

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
      bypassLoadingHardCap={props.bypassLoadingHardCap}
    />,
  );
}

describe("PreviewPanelFrame — loading-overlayens debounce och hard-cap", () => {
  it("mountar inte en blank iframe innan den riktiga preview-källan finns", () => {
    const handleIframeLoad = vi.fn();
    const view = renderFrame({ previewSrc: "", handleIframeLoad });

    expect(screen.queryByTitle("Preview")).toBeNull();
    expect(handleIframeLoad).not.toHaveBeenCalled();

    view.rerender(
      <PreviewPanelFrame
        isLoading
        iframeError={false}
        iframeErrorMessage={null}
        iframeDiagnosticCode={null}
        iframeRunbookLines={[]}
        handleOpenInNewTab={vi.fn()}
        previewSrc="https://preview.example/real"
        iframeRef={{ current: null }}
        handleIframeLoad={handleIframeLoad}
        handleIframeError={vi.fn()}
      />,
    );
    const iframe = screen.getByTitle("Preview");
    fireEvent.load(iframe);
    expect(handleIframeLoad).toHaveBeenCalledTimes(1);
  });

  it("visar overlayen efter debouncen och släcker den tyst efter hard-capen", () => {
    vi.useFakeTimers();
    try {
      renderFrame();

      // Innan debounce (350ms): ingen overlay — snabba navigeringar ska inte flimra.
      expect(screen.queryByText("Laddar...")).toBeNull();

      // Efter debounce men innan hard-capen (6000ms): overlay syns.
      act(() => vi.advanceTimersByTime(400));
      expect(screen.getByText("Laddar...")).toBeTruthy();

      // Efter hard-capen: overlayen släcks och ytan är medvetet tyst
      // (ägarbeslut 2026-08-01: ingen slow-boot-rad ovanpå previewn).
      act(() => vi.advanceTimersByTime(6_000));
      expect(screen.queryByText("Laddar...")).toBeNull();
      expect(screen.queryByText(/tar längre tid än vanligt/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("låter Tier-2-readiness behålla overlayen förbi den generiska hard-capen", () => {
    vi.useFakeTimers();
    try {
      renderFrame({ bypassLoadingHardCap: true });

      act(() => vi.advanceTimersByTime(400));
      expect(screen.getByText("Laddar...")).toBeTruthy();

      act(() => vi.advanceTimersByTime(6_000));
      expect(screen.getByText("Laddar...")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("behåller en synlig overlay när Tier-2 tar över hard-cap-ägarskapet", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderFrame({ bypassLoadingHardCap: false });

      act(() => vi.advanceTimersByTime(400));
      expect(screen.getByText("Laddar...")).toBeTruthy();

      rerender(
        <PreviewPanelFrame
          isLoading
          iframeError={false}
          iframeErrorMessage={null}
          iframeDiagnosticCode={null}
          iframeRunbookLines={[]}
          handleOpenInNewTab={vi.fn()}
          previewSrc="https://preview.example/ver_1"
          iframeRef={{ current: null }}
          handleIframeLoad={vi.fn()}
          handleIframeError={vi.fn()}
          bypassLoadingHardCap
        />,
      );

      expect(screen.getByText("Laddar...")).toBeTruthy();
      act(() => vi.advanceTimersByTime(6_000));
      expect(screen.getByText("Laddar...")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("behåller hard-capen när Tier-2 fortfarande ägs av extern lifecycle-loading", () => {
    vi.useFakeTimers();
    try {
      renderFrame({ bypassLoadingHardCap: false });

      act(() => vi.advanceTimersByTime(6_100));
      expect(screen.queryByText("Laddar...")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-armar overlayen när previewSrc byts medan laddningen fortfarande pågår", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderFrame({ isLoading: true });
      act(() => vi.advanceTimersByTime(6_100));
      // Hard-capen har släckt overlayen för den första laddningen.
      expect(screen.queryByText("Laddar...")).toBeNull();

      rerender(
        <PreviewPanelFrame
          isLoading
          iframeError={false}
          iframeErrorMessage={null}
          iframeDiagnosticCode={null}
          iframeRunbookLines={[]}
          handleOpenInNewTab={vi.fn()}
          previewSrc="https://preview.example/ver_2"
          iframeRef={{ current: null }}
          handleIframeLoad={vi.fn()}
          handleIframeError={vi.fn()}
        />,
      );

      // Ny src = ny laddning: debounce/hard-cap börjar om och overlayen syns igen.
      act(() => vi.advanceTimersByTime(400));
      expect(screen.getByText("Laddar...")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("visar aldrig overlayen när laddningen redan är klar", () => {
    vi.useFakeTimers();
    try {
      renderFrame({ isLoading: false });
      act(() => vi.advanceTimersByTime(7_000));

      expect(screen.queryByText("Laddar...")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("låter fel-overlayen äga ytan när iframen är trasig", () => {
    vi.useFakeTimers();
    try {
      renderFrame({
        isLoading: true,
        iframeError: true,
        iframeErrorMessage: "Iframe failed to load.",
      });
      act(() => vi.advanceTimersByTime(6_100));

      expect(screen.getByText("Iframe failed to load.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
