"use client";

import {
  dispatchPlacementSelectEvent,
  type PlacementSelectEventDetail,
} from "@/lib/builder/inspect-events";
import type { RegistryMatch } from "@/lib/builder/jsx-element-registry";
import {
  bridgeSectionCandidatesToElementMap,
  extractSectionZones,
  isSameInsertionPoint,
  nearestInsertionPoint,
  sectionZonesFromCode,
  type BridgeSectionCandidate,
  type InsertionPoint,
} from "@/lib/builder/sectionAnalyzer";
import type { ElementMapItem, ElementMapResponse } from "@/lib/builder/types";
import { isCompatibilityShimPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import type { InspectEngine } from "../preview-panel-types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type MouseEventHandler,
  type RefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";

export function usePreviewPanelInspectMapPlacement(options: {
  inspectorEnabled: boolean;
  previewUrl: string | null;
  versionId: string | null;
  placementMode: boolean;
  /** När sann, ladda elementkarta/zoner som för placering (t.ex. Visual Composer) utan chat-picker-läge. */
  composerMode?: boolean;
  /** Ägs av `usePreviewSurfaceMode` i builderskalet — knappen sitter i chatpanelen. */
  inspectMode: boolean;
  setInspectMode: (update: boolean | ((prev: boolean) => boolean)) => void;
  iframeLoading: boolean;
  externalLoading: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  fetchFilesForRegistry: () => void | Promise<void>;
  setInspectStatus: Dispatch<SetStateAction<string | null>>;
  setLastCodeMatch: Dispatch<SetStateAction<RegistryMatch | null>>;
  onPlacementComplete?: (detail: PlacementSelectEventDetail) => void;
  inspectEngine: InspectEngine;
  /**
   * Startsida-källa för zon-fallback när bridge/elementkarta är tom.
   * Utan den faller placering tillbaka till bara topp/botten.
   */
  homePageCode?: string | null;
}) {
  const {
    inspectorEnabled,
    previewUrl,
    versionId,
    placementMode,
    composerMode = false,
    inspectMode,
    setInspectMode,
    iframeLoading,
    externalLoading,
    iframeRef,
    fetchFilesForRegistry,
    setInspectStatus,
    setLastCodeMatch,
    onPlacementComplete,
    inspectEngine,
    homePageCode = null,
  } = options;

  const zonesActive = placementMode || Boolean(composerMode);

  const [elementMap, setElementMap] = useState<ElementMapItem[]>([]);
  const [elementMapLoading, setElementMapLoading] = useState(false);
  const [inspectorUnavailable, setInspectorUnavailable] = useState(false);
  const [hoveredMapElement, setHoveredMapElement] = useState<ElementMapItem | null>(null);
  const [hoveredPlacement, setHoveredPlacement] = useState<InsertionPoint | null>(null);
  const inspectFetchTokenRef = useRef(0);
  /** Spegel av elementMap.length för rena timeout-beslut (inga setState i updaters). */
  const elementMapLengthRef = useRef(0);
  useEffect(() => {
    elementMapLengthRef.current = elementMap.length;
  }, [elementMap]);

  const fetchElementMap = useCallback(
    async (
      url: string,
      width: number,
      height: number,
      requestToken = inspectFetchTokenRef.current,
    ) => {
      if (!inspectorEnabled) {
        if (requestToken === inspectFetchTokenRef.current) {
          setElementMap([]);
          setElementMapLoading(false);
          setInspectorUnavailable(true);
        }
        return 0;
      }
      if (requestToken !== inspectFetchTokenRef.current) return 0;
      setElementMapLoading(true);
      setInspectorUnavailable(false);
      try {
        const inspectorUrl = url.startsWith("/") ? `${window.location.origin}${url}` : url;

        const isOwnEnginePreview = isCompatibilityShimPreviewUrl(inspectorUrl);

        const res = await fetch("/api/inspector-element-map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: inspectorUrl,
            viewportWidth: width,
            viewportHeight: height,
            maxElements: 300,
          }),
        });
        const data = (await res.json().catch(() => null)) as ElementMapResponse | null;
        if (res.ok && data?.success && Array.isArray(data.elements)) {
          if (requestToken !== inspectFetchTokenRef.current) return 0;
          setElementMap(data.elements);
          return data.elements.length;
        }
        if (requestToken !== inspectFetchTokenRef.current) return 0;
        setElementMap([]);
        setInspectorUnavailable(true);
        if (isOwnEnginePreview) {
          console.info(
            "[inspector] Own-engine preview — map/capture engines require a local Playwright install (not available in serverless).",
          );
        }
        return 0;
      } catch {
        if (requestToken !== inspectFetchTokenRef.current) return 0;
        setElementMap([]);
        setInspectorUnavailable(true);
        return 0;
      } finally {
        if (requestToken === inspectFetchTokenRef.current) {
          setElementMapLoading(false);
        }
      }
    },
    [inspectorEnabled],
  );

  const handleToggleInspect = useCallback(() => {
    if (!inspectorEnabled || !previewUrl) return;
    setInspectMode((prev) => !prev);
  }, [inspectorEnabled, previewUrl, setInspectMode]);

  // Sidoeffekterna hänger på lägesbytet, inte på knappen: `inspectMode` ägs av
  // builderskalet och togglas numera från chatpanelens Verktyg-rad.
  const appliedInspectModeRef = useRef(inspectMode);
  useEffect(() => {
    if (appliedInspectModeRef.current === inspectMode) return;
    appliedInspectModeRef.current = inspectMode;
    const requestToken = ++inspectFetchTokenRef.current;
    if (inspectMode) {
      // plan-02 / STATUS-01-fynd: tidigare `iframe.src = buildPreviewSrc(...)`
      // här återladdade preview-iframen vid inspect-toggle, vilket nollställde
      // dess scroll-position och fick användarens sida att "scrolla upp" ~0.5s
      // efter att Inspektera-knappen aktiverats. Element-map hämtas via
      // `/api/inspector-element-map` mot `previewUrl` direkt och behöver inte
      // en ren iframe-state. Den parallella useEffect:en nedan fortsätter
      // dessutom trigga delayed map-fetch när previewUrl/versionId ändras.
      if (previewUrl) {
        void fetchFilesForRegistry();
        if (inspectEngine !== "bridge") {
          // Bridge-engine läser DOMen i previewn själv (postMessage) — ingen
          // Playwright/element-map. usePreviewInspectBridge sköter set-mode.
          const container = iframeRef.current?.parentElement;
          const w = container?.clientWidth || 1280;
          const h = container?.clientHeight || 800;
          void fetchElementMap(previewUrl, w, h, requestToken).then((count) => {
            if (requestToken === inspectFetchTokenRef.current && count > 0) {
              setInspectStatus(`Elementkarta laddad: ${count} element. Hovra för att identifiera.`);
            }
          });
        }
      }
    } else {
      setHoveredMapElement(null);
      setElementMap([]);
      setElementMapLoading(false);
    }
    setLastCodeMatch(null);
    setInspectStatus(
      inspectEngine === "bridge"
        ? "Inspektera: klicka på ett element i previewn."
        : "Laddar elementkarta...",
    );
  }, [
    inspectMode,
    previewUrl,
    fetchFilesForRegistry,
    fetchElementMap,
    iframeRef,
    inspectEngine,
    setInspectStatus,
    setLastCodeMatch,
  ]);

  const liveSectionZones = useMemo(() => extractSectionZones(elementMap), [elementMap]);
  const codeSectionZones = useMemo(
    () => (homePageCode ? sectionZonesFromCode(homePageCode) : []),
    [homePageCode],
  );
  // Live inspect/bridge vinner; kodbaserad fallback gör att drag/placement
  // fortfarande kan erbjuda "Efter Hero" när preview-zoner saknas.
  const sectionZonesApproximate =
    liveSectionZones.length === 0 && codeSectionZones.length > 0;
  const sectionZones = useMemo(
    () => (liveSectionZones.length > 0 ? liveSectionZones : codeSectionZones),
    [liveSectionZones, codeSectionZones],
  );

  /**
   * Bridge → elementMap → extractSectionZones. Anropas från usePreviewInspectBridge
   * när child svarar på request-sections (prod utan Playwright).
   */
  const applyBridgeSectionCandidates = useCallback(
    (candidates: BridgeSectionCandidate[]) => {
      // Invalidera eventuell bridge-timeout i zones-effecten.
      inspectFetchTokenRef.current += 1;
      const mapped = bridgeSectionCandidatesToElementMap(candidates);
      setElementMap(mapped);
      setElementMapLoading(false);
      // Tom lista = närmaste fallback (Längst upp / Längst ner) via nearestInsertionPoint.
      setInspectorUnavailable(mapped.length === 0);
    },
    [],
  );

  const handlePlacementMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!zonesActive) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const yPercent = Number(((y / rect.height) * 100).toFixed(2));
      const insertion = nearestInsertionPoint(yPercent, sectionZones);
      // `nearestInsertionPoint` returnerar alltid ett nytt objekt, men antalet
      // distinkta insättningspunkter är litet. Utan identitetsjämförelsen
      // renderar hela PreviewPanel om på varje pekarhändelse — och sedan
      // registry-drag:en (#602) kopplade `dragover` till samma handler gäller
      // det under hela draget, inte bara vid hover.
      setHoveredPlacement((prev) =>
        isSameInsertionPoint(prev, insertion) ? prev : insertion,
      );
    },
    [zonesActive, sectionZones],
  );

  const handlePlacementClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!previewUrl || !placementMode || iframeLoading || externalLoading) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const xPercent = Number(((x / rect.width) * 100).toFixed(2));
      const yPercent = Number(((y / rect.height) * 100).toFixed(2));
      const insertion = nearestInsertionPoint(yPercent, sectionZones);

      const detail: PlacementSelectEventDetail = {
        id: `placement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        demoUrl: previewUrl,
        xPercent,
        yPercent,
        lineYPercent: insertion.lineYPercent,
        viewportWidth: Math.round(rect.width),
        viewportHeight: Math.round(rect.height),
        placement: insertion.placement,
        placementLabel: insertion.label,
        anchorSection: insertion.anchorSection,
      };
      dispatchPlacementSelectEvent(detail);
      onPlacementComplete?.(detail);
      toast.success(`Placering vald: ${insertion.label}`);
    },
    [previewUrl, placementMode, iframeLoading, externalLoading, sectionZones, onPlacementComplete],
  );

  const handleInspectMouseMove = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (inspectEngine !== "map" || elementMap.length === 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const xPct = ((event.clientX - rect.left) / rect.width) * 100;
      const yPct = ((event.clientY - rect.top) / rect.height) * 100;
      let best: ElementMapItem | null = null;
      let bestArea = Infinity;
      for (const el of elementMap) {
        const vp = el.vpPercent;
        if (xPct >= vp.x && xPct <= vp.x + vp.w && yPct >= vp.y && yPct <= vp.y + vp.h) {
          const area = vp.w * vp.h;
          if (area < bestArea && area > 0.01) {
            best = el;
            bestArea = area;
          }
        }
      }
      setHoveredMapElement(best);
    },
    [elementMap, inspectEngine],
  );

  useEffect(() => {
    if (!previewUrl || !inspectorEnabled) return;
    // Bridge-engine använder ingen element-map → hoppa över pre-warm (annars
    // onödiga 503 mot /api/inspector-element-map i prod).
    if (inspectEngine === "bridge") return;
    setElementMap([]);
    let cancelled = false;
    // Timer-leak guard (CI-flake, run 29202297223): the pending sleep timer
    // must be cleared on unmount, otherwise it fires after jsdom teardown in
    // tests ("ReferenceError: window is not defined"). Track the id here and
    // clear it in the effect cleanup — a cleared sleep never resolves, which
    // is fine because `cancelled` would have short-circuited `run()` anyway.
    let pendingSleepTimerId: number | null = null;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        pendingSleepTimerId = window.setTimeout(() => {
          pendingSleepTimerId = null;
          resolve();
        }, ms);
      });

    const run = async () => {
      const delays = [2000, 3000, 5000];
      for (const delay of delays) {
        await sleep(delay);
        if (cancelled) return;
        const container = iframeRef.current?.parentElement;
        const w = container?.clientWidth || 1280;
        const h = container?.clientHeight || 800;
        const count = await fetchElementMap(previewUrl, w, h);
        if (cancelled) return;
        if (count > 0) return;
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (pendingSleepTimerId !== null) {
        window.clearTimeout(pendingSleepTimerId);
        pendingSleepTimerId = null;
      }
    };
  }, [previewUrl, versionId, fetchElementMap, inspectorEnabled, iframeRef, inspectEngine]);

  useEffect(() => {
    if (inspectorEnabled) return;
    setInspectMode(false);
    setHoveredMapElement(null);
    setElementMap([]);
    setElementMapLoading(false);
    setHoveredPlacement(null);
  }, [inspectorEnabled, setInspectMode]);

  useEffect(() => {
    if (!zonesActive) return;
    setInspectMode(false);
    setHoveredMapElement(null);
  }, [zonesActive, setInspectMode]);

  useEffect(() => {
    if (!zonesActive || !previewUrl || !inspectorEnabled) {
      setHoveredPlacement(null);
      return;
    }
    // Bridge-engine: sektionszoner kommer via postMessage (applyBridgeSectionCandidates).
    // Playwright/element-map finns inte i serverless prod — hoppa över den vägen.
    if (inspectEngine === "bridge") {
      const requestToken = ++inspectFetchTokenRef.current;
      setElementMap([]);
      setElementMapLoading(true);
      setInspectorUnavailable(false);
      const BRIDGE_SECTIONS_TIMEOUT_MS = 5000;
      const timer = window.setTimeout(() => {
        if (requestToken !== inspectFetchTokenRef.current) return;
        setElementMapLoading(false);
        // Ingen bridge-svar → tomma zoner → nearestInsertionPoint = topp/botten.
        if (elementMapLengthRef.current === 0) {
          setInspectorUnavailable(true);
        }
      }, BRIDGE_SECTIONS_TIMEOUT_MS);
      return () => {
        window.clearTimeout(timer);
      };
    }
    const container = iframeRef.current?.parentElement;
    const w = container?.clientWidth || 1280;
    const h = container?.clientHeight || 800;
    void fetchElementMap(previewUrl, w, h);
  }, [
    zonesActive,
    previewUrl,
    fetchElementMap,
    inspectorEnabled,
    iframeRef,
    inspectEngine,
  ]);

  return {
    inspectMode,
    setInspectMode,
    elementMap,
    elementMapLoading,
    inspectorUnavailable,
    hoveredMapElement,
    setHoveredMapElement,
    hoveredPlacement,
    setHoveredPlacement,
    handleToggleInspect,
    sectionZones,
    sectionZonesApproximate,
    applyBridgeSectionCandidates,
    handlePlacementMouseMove,
    handlePlacementClick,
    handleInspectMouseMove,
  };
}
