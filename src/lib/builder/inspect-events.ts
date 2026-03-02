export const INSPECT_CAPTURE_EVENT = "sajtmaskin:inspect-capture";

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

export function dispatchInspectCaptureEvent(detail: InspectCaptureEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<InspectCaptureEventDetail>(INSPECT_CAPTURE_EVENT, { detail }));
}

