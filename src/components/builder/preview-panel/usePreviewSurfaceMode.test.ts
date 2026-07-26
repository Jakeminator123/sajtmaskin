// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePreviewSurfaceMode } from "./usePreviewSurfaceMode";

/**
 * Composer och inspect låg tidigare i två separata `useState` (previewpanelen
 * respektive element-map-hooken) och hölls isär av manuella `setInspectMode(false)`-
 * anrop i knapp-handlern. Efter lyftet finns EN ägare, så uteslutningen ska hålla
 * oavsett vilken väg läget sätts — inklusive de programmatiska.
 */
function harness(previewUrl: string | null = "https://preview.example/ver_1") {
  return renderHook(() =>
    usePreviewSurfaceMode({ previewUrl, canShowCode: true, inspectorEnabled: true }),
  );
}

describe("usePreviewSurfaceMode — composer och inspect utesluter varandra", () => {
  it("stänger composer när inspect slås på, och tvärtom", () => {
    const { result } = harness();

    act(() => result.current.toggleComposer());
    expect(result.current.composerMode).toBe(true);
    expect(result.current.inspectMode).toBe(false);

    act(() => result.current.toggleInspect());
    expect(result.current.inspectMode).toBe(true);
    expect(result.current.composerMode).toBe(false);

    act(() => result.current.toggleComposer());
    expect(result.current.composerMode).toBe(true);
    expect(result.current.inspectMode).toBe(false);
  });

  it("håller uteslutningen även när lägena sätts programmatiskt", () => {
    const { result } = harness();

    act(() => result.current.setInspectMode(true));
    expect(result.current.inspectMode).toBe(true);

    act(() => result.current.setComposerMode(true));
    expect(result.current.composerMode).toBe(true);
    expect(result.current.inspectMode).toBe(false);
  });

  it("låter ett avstängningsanrop från det inaktiva läget vara en no-op", () => {
    const { result } = harness();

    act(() => result.current.setComposerMode(true));
    // Element-map-hooken nollställer inspect i sina effekter — det får inte
    // råka stänga composern.
    act(() => result.current.setInspectMode(false));
    expect(result.current.composerMode).toBe(true);
  });

  it("stänger av båda lägena när previewn försvinner", () => {
    const { result, rerender } = renderHook(
      ({ previewUrl }: { previewUrl: string | null }) =>
        usePreviewSurfaceMode({ previewUrl, canShowCode: true, inspectorEnabled: true }),
      { initialProps: { previewUrl: "https://preview.example/ver_1" as string | null } },
    );

    act(() => result.current.toggleComposer());
    expect(result.current.composerMode).toBe(true);

    rerender({ previewUrl: null });
    expect(result.current.composerMode).toBe(false);
    expect(result.current.inspectMode).toBe(false);
  });

  it("stänger composern när kodvyn tar över previewytan", () => {
    const { result } = harness();

    act(() => result.current.toggleComposer());
    act(() => result.current.toggleCodeView());

    expect(result.current.viewMode).toBe("code");
    expect(result.current.composerMode).toBe(false);
  });

  it("öppnar inte inspect när inspektorn är avstängd via flagga", () => {
    const { result } = renderHook(() =>
      usePreviewSurfaceMode({
        previewUrl: "https://preview.example/ver_1",
        canShowCode: true,
        inspectorEnabled: false,
      }),
    );

    act(() => result.current.toggleInspect());
    expect(result.current.inspectMode).toBe(false);
  });
});
