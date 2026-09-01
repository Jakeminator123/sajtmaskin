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

  it("loading-overlayen är ren status och blockerar aldrig pekare mot previewn", () => {
    // Prod 2026-08-27: Tier-2 hoppar över hard-capen, så overlayen kan ligga
    // kvar länge ovanpå en redan fungerande sajt. Den får då inte äta klick.
    vi.useFakeTimers();
    try {
      renderFrame({ bypassLoadingHardCap: true });
      act(() => vi.advanceTimersByTime(400));

      const overlay = screen
        .getByText("Laddar...")
        .closest('[aria-hidden="true"]');
      expect(overlay).not.toBeNull();
      expect(overlay!.className.split(/\s+/)).toContain("pointer-events-none");

      // Även långt förbi den generiska hard-capen (Tier-2-bypassens fönster,
      // där overlayen bevisligen legat kvar i minuter i prod) ska hela
      // fullskärmsytan förbli klickgenomsläpplig.
      act(() => vi.advanceTimersByTime(60_000));
      const lateOverlay = screen
        .getByText("Laddar...")
        .closest('[aria-hidden="true"]');
      expect(lateOverlay).not.toBeNull();
      expect(lateOverlay!.className.split(/\s+/)).toContain("pointer-events-none");
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

  it("ersätter Laddar-pillen med Verifierar preview när dokumentet redan laddat", () => {
    vi.useFakeTimers();
    try {
      renderFrame({ bypassLoadingHardCap: true });
      fireEvent.load(screen.getByTitle("Preview"));
      act(() => vi.advanceTimersByTime(400));

      expect(screen.queryByText("Laddar...")).toBeNull();
      const chip = screen.getByText("Verifierar preview…");
      const surface = chip.closest('[aria-hidden="true"]');
      expect(surface).not.toBeNull();
      expect(surface!.className.split(/\s+/)).toContain("pointer-events-none");
    } finally {
      vi.useRealTimers();
    }
  });

  it("behåller Laddar-pillen innan något dokument laddats", () => {
    vi.useFakeTimers();
    try {
      renderFrame({ bypassLoadingHardCap: true });
      act(() => vi.advanceTimersByTime(400));

      expect(screen.getByText("Laddar...")).toBeTruthy();
      expect(screen.queryByText("Verifierar preview…")).toBeNull();
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

  it("visar varken banner eller helskärmslock för preview_ready_timeout", () => {
    // Ägarbeslut 2026-09-01 (chat 5efde3c4): timeouten är en misstanke.
    // Recovery körs tyst; ytan lämnas orörd så länge sajten syns.
    renderFrame({
      isLoading: false,
      iframeError: true,
      iframeErrorMessage: "Previewen laddade inte klart innan timeout.",
      iframeDiagnosticCode: "preview_ready_timeout",
    });

    expect(screen.queryByText(/Fungerar sajten nedanför/)).toBeNull();
    expect(screen.queryByText("Öppna i ny flik")).toBeNull();
    expect(screen.queryByText("Previewen laddade inte klart innan timeout.")).toBeNull();
    expect(document.querySelector(".absolute.inset-0.bg-black\\/85")).toBeNull();
  });

  it("behåller helskärms-fel-overlayen för andra diagnostikkoder", () => {
    renderFrame({
      isLoading: false,
      iframeError: true,
      iframeErrorMessage: "Preview iframe document could not be read.",
      iframeDiagnosticCode: "preview_document_unavailable",
    });

    expect(screen.queryByText(/Fungerar sajten nedanför/)).toBeNull();
    const message = screen.getByText("Preview iframe document could not be read.");
    const cover = message.closest("div.absolute");
    expect(cover).not.toBeNull();
    expect(cover!.className.split(/\s+/)).toContain("inset-0");
  });

  it("visar fel-overlayens hjälptext med opak sekundärtexttoken", () => {
    renderFrame({
      isLoading: false,
      iframeError: true,
      iframeErrorMessage: "Iframe failed to load.",
      iframeDiagnosticCode: "preview_runtime_error",
    });

    const helpText = screen.getByText(
      "Öppna i ny flik eller försök reparera previewn om felet kvarstår.",
    );
    const classes = helpText.className.split(/\s+/);
    expect(classes).toContain("text-muted-foreground");
    expect(classes).not.toContain("text-gray-500");

    const diagnosticCode = screen.getByText("Kod: preview_runtime_error");
    const diagnosticClasses = diagnosticCode.className.split(/\s+/);
    expect(diagnosticClasses).toContain("text-muted-foreground");
    expect(diagnosticClasses).not.toContain("text-zinc-500");
    expect(diagnosticCode.parentElement?.className.split(/\s+/)).toContain("bg-black/85");
  });
});
