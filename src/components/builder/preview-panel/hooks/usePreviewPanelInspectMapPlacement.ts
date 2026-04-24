"use client";

import {
  dispatchPlacementSelectEvent,
  type PlacementSelectEventDetail,
} from "@/lib/builder/inspect-events";
import type { RegistryMatch } from "@/lib/builder/jsx-element-registry";
import {
  extractSectionZones,
  nearestInsertionPoint,
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
  /** When true, load element map for inline click-to-edit (independent of inspector feature flag). */
  inlineEditMode?: boolean;
  iframeLoading: boolean;
  externalLoading: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  fetchFilesForRegistry: () => void | Promise<void>;
  setInspectStatus: Dispatch<SetStateAction<string | null>>;
  setLastCodeMatch: Dispatch<SetStateAction<RegistryMatch | null>>;
  onPlacementComplete?: (detail: PlacementSelectEventDetail) => void;
  inspectEngine: InspectEngine;
}) {
  const {
    inspectorEnabled,
    previewUrl,
    versionId,
    placementMode,
    composerMode = false,
    inlineEditMode = false,
    iframeLoading,
    externalLoading,
    iframeRef,
    fetchFilesForRegistry,
    setInspectStatus,
    setLastCodeMatch,
    onPlacementComplete,
    inspectEngine,
  } = options;

  const zonesActive = placementMode || Boolean(composerMode);
  const needsElementMap = inspectorEnabled || inlineEditMode;

  const [inspectMode, setInspectMode] = useState(false);
  const [elementMap, setElementMap] = useState<ElementMapItem[]>([]);
  const [elementMapLoading, setElementMapLoading] = useState(false);
  const [inspectorUnavailable, setInspectorUnavailable] = useState(false);
  const [hoveredMapElement, setHoveredMapElement] = useState<ElementMapItem | null>(null);
  const [hoveredPlacement, setHoveredPlacement] = useState<InsertionPoint | null>(null);
  const inspectFetchTokenRef = useRef(0);

  const fetchElementMap = useCallback(
    async (
      url: string,
      width: number,
      height: number,
      requestToken = inspectFetchTokenRef.current,
    ) => {
      if (!inspectorEnabled && !inlineEditMode) {
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
            "[inspector] Own-engine preview — inspector requires Playwright or inspector-worker to be running.",
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
    [inspectorEnabled, inlineEditMode],
  );

  const handleToggleInspect = useCallback(() => {
    if (!inspectorEnabled || !previewUrl) return;
    setInspectMode((prev) => {
      const next = !prev;
      const requestToken = ++inspectFetchTokenRef.current;
      if (next) {
        // plan-02 / STATUS-01-fynd: tidigare `iframe.src = buildPreviewSrc(...)`
        // här återladdade preview-iframen vid inspect-toggle, vilket nollställde
        // dess scroll-position och fick användarens sida att "scrolla upp" ~0.5s
        // efter att Inspektera-knappen aktiverats. Element-map hämtas via
        // `/api/inspector-element-map` mot `previewUrl` direkt och behöver inte
        // en ren iframe-state. Den parallella useEffect:en nedan fortsätter
        // dessutom trigga delayed map-fetch när previewUrl/versionId ändras.
        void fetchFilesForRegistry();
        const container = iframeRef.current?.parentElement;
        const w = container?.clientWidth || 1280;
        const h = container?.clientHeight || 800;
        void fetchElementMap(previewUrl, w, h, requestToken).then((count) => {
          if (requestToken === inspectFetchTokenRef.current && count > 0) {
            setInspectStatus(`Elementkarta laddad: ${count} element. Hovra för att identifiera.`);
          }
        });
      } else {
        setHoveredMapElement(null);
        setElementMap([]);
        setElementMapLoading(false);
      }
      return next;
    });
    setLastCodeMatch(null);
    setInspectStatus("Laddar elementkarta...");
  }, [
    previewUrl,
    fetchFilesForRegistry,
    fetchElementMap,
    inspectorEnabled,
    iframeRef,
    setInspectStatus,
    setLastCodeMatch,
  ]);

  const sectionZones = useMemo(() => extractSectionZones(elementMap), [elementMap]);

  const handlePlacementMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!zonesActive) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const yPercent = Number(((y / rect.height) * 100).toFixed(2));
      const insertion = nearestInsertionPoint(yPercent, sectionZones);
      setHoveredPlacement(insertion);
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
    if (!previewUrl || !needsElementMap) return;
    setElementMap([]);
    let cancelled = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timerId = window.setTimeout(() => {
          window.clearTimeout(timerId);
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
    };
  }, [previewUrl, versionId, fetchElementMap, needsElementMap, iframeRef]);

  useEffect(() => {
    if (needsElementMap) return;
    setInspectMode(false);
    setHoveredMapElement(null);
    setElementMap([]);
    setElementMapLoading(false);
    setHoveredPlacement(null);
  }, [needsElementMap]);

  useEffect(() => {
    if (!zonesActive) return;
    setInspectMode(false);
    setHoveredMapElement(null);
  }, [zonesActive]);

  useEffect(() => {
    if (!zonesActive || !previewUrl || !inspectorEnabled) {
      setHoveredPlacement(null);
      return;
    }
    const container = iframeRef.current?.parentElement;
    const w = container?.clientWidth || 1280;
    const h = container?.clientHeight || 800;
    void fetchElementMap(previewUrl, w, h);
  }, [zonesActive, previewUrl, fetchElementMap, inspectorEnabled, iframeRef]);

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
    handlePlacementMouseMove,
    handlePlacementClick,
    handleInspectMouseMove,
  };
}
