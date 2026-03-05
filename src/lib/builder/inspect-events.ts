export const INSPECT_CAPTURE_EVENT = "sajtmaskin:inspect-capture";
export const PLACEMENT_SELECT_EVENT = "sajtmaskin:placement-select";

export type InspectCapturedElement = {
  tag: string;
  id: string | null;
  className: string | null;
  text: string | null;
  ariaLabel: string | null;
  role: string | null;
  href: string | null;
  selector: string | null;
  nearestHeading: string | null;
};

export type InspectCaptureEventDetail = {
  id: string;
  demoUrl: string;
  xPercent: number;
  yPercent: number;
  viewportWidth: number;
  viewportHeight: number;
  capturedUrl?: string;
  previewDataUrl?: string;
  pointSummary?: string;
  element?: InspectCapturedElement;
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  source?: "worker" | "local";
  error?: string;
};

export type PlacementAnchorSection = {
  id: string;
  label: string;
  type: string;
  top: number;
  bottom: number;
};

export type PlacementSelectEventDetail = {
  id: string;
  demoUrl: string;
  xPercent: number;
  yPercent: number;
  lineYPercent: number;
  viewportWidth: number;
  viewportHeight: number;
  placement: string;
  placementLabel: string;
  anchorSection?: PlacementAnchorSection;
};

export function dispatchInspectCaptureEvent(detail: InspectCaptureEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<InspectCaptureEventDetail>(INSPECT_CAPTURE_EVENT, { detail }));
}

export function dispatchPlacementSelectEvent(detail: PlacementSelectEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PlacementSelectEventDetail>(PLACEMENT_SELECT_EVENT, { detail }));
}

