"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { PreviewViewMode } from "./preview-panel-types";

type ModeUpdate = boolean | ((prev: boolean) => boolean);
type ViewModeUpdate = PreviewViewMode | ((prev: PreviewViewMode) => PreviewViewMode);

/**
 * Composer och inspect är samma slags läge: båda tar över previewytan och
 * kan aldrig vara igång samtidigt. De ligger därför i EN state-variabel —
 * uteslutningen är strukturell i stället för två useState som synkas mot
 * varandra i effekter.
 */
type PreviewSurfaceMode = "none" | "composer" | "inspect";

export interface PreviewSurfaceState {
  composerMode: boolean;
  inspectMode: boolean;
  setComposerMode: (update: ModeUpdate) => void;
  setInspectMode: (update: ModeUpdate) => void;
  toggleComposer: () => void;
  toggleInspect: () => void;
  viewMode: PreviewViewMode;
  setViewMode: (update: ViewModeUpdate) => void;
  /** Kör ett vy-byte (och följdstate) i samma transition som `isViewSwitchPending` speglar. */
  runViewSwitch: (apply: () => void) => void;
  isViewSwitchPending: boolean;
  toggleCodeView: () => void;
  toggleElementRegistry: () => void;
  canShowCode: boolean;
  inspectorEnabled: boolean;
}

/**
 * Delad ägare för previewens lägen. Bor hos `BuilderShellContent` eftersom
 * kontrollerna nu ligger i chatpanelens Verktyg-rad och i headern, medan
 * ytan de styr renderas i previewpanelen.
 */
export function usePreviewSurfaceMode(options: {
  previewUrl: string | null;
  canShowCode: boolean;
  inspectorEnabled: boolean;
}): PreviewSurfaceState {
  const { previewUrl, canShowCode, inspectorEnabled } = options;
  const [surfaceMode, setSurfaceMode] = useState<PreviewSurfaceMode>("none");
  const [viewMode, setViewMode] = useState<PreviewViewMode>("preview");
  const [isViewSwitchPending, startViewSwitchTransition] = useTransition();

  const composerMode = surfaceMode === "composer";
  const inspectMode = surfaceMode === "inspect";

  const applyMode = useCallback(
    (mode: Exclude<PreviewSurfaceMode, "none">, update: ModeUpdate) => {
      setSurfaceMode((prev) => {
        const next = typeof update === "function" ? update(prev === mode) : update;
        if (next) return mode;
        return prev === mode ? "none" : prev;
      });
    },
    [],
  );

  const setComposerMode = useCallback(
    (update: ModeUpdate) => applyMode("composer", update),
    [applyMode],
  );
  const setInspectMode = useCallback(
    (update: ModeUpdate) => applyMode("inspect", update),
    [applyMode],
  );

  // Utan preview finns ingen yta att styra — annars kan ett läge bli kvar
  // påslaget medan kontrollerna som stänger det är dolda.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nollställer läget när previewen försvinner; idempotent (React bailar på samma värde)
    if (!previewUrl) setSurfaceMode("none");
  }, [previewUrl]);

  const toggleComposer = useCallback(() => {
    if (!previewUrl) return;
    setComposerMode((value) => !value);
  }, [previewUrl, setComposerMode]);

  const toggleInspect = useCallback(() => {
    if (!previewUrl || !inspectorEnabled) return;
    setInspectMode((value) => !value);
  }, [previewUrl, inspectorEnabled, setInspectMode]);

  const runViewSwitch = useCallback((apply: () => void) => {
    startViewSwitchTransition(apply);
  }, []);

  const toggleCodeView = useCallback(() => {
    if (!canShowCode) return;
    runViewSwitch(() => {
      // Composer patchar previewens filer direkt och har ingen mening i kodvyn.
      setSurfaceMode((prev) => (prev === "composer" ? "none" : prev));
      setViewMode((prev) => (prev === "code" ? "preview" : "code"));
    });
  }, [canShowCode, runViewSwitch]);

  const toggleElementRegistry = useCallback(() => {
    if (!canShowCode) return;
    runViewSwitch(() => {
      setSurfaceMode((prev) => (prev === "composer" ? "none" : prev));
      setViewMode((prev) => (prev === "registry" ? "preview" : "registry"));
    });
  }, [canShowCode, runViewSwitch]);

  return {
    composerMode,
    inspectMode,
    setComposerMode,
    setInspectMode,
    toggleComposer,
    toggleInspect,
    viewMode,
    setViewMode,
    runViewSwitch,
    isViewSwitchPending,
    toggleCodeView,
    toggleElementRegistry,
    canShowCode,
    inspectorEnabled,
  };
}
