import type { BridgePick, BridgeRect, BridgeRegion } from "./hooks/usePreviewInspectBridge";
import type { InspectElementActions } from "@/lib/builder/inspect-element-actions";

/** Elementmenyns lägen: menyn själv, textrutan, eller mediabiblioteket. */
type InspectMenuMode = "menu" | "text" | "image";

type InspectMenuState = {
  pick: BridgePick;
  actions: InspectElementActions;
  point: { x: number; y: number };
  rect: BridgeRect | null;
  bounds: { width: number; height: number };
  mode: InspectMenuMode;
};

type InspectRegionState = {
  point: { x: number; y: number };
  bounds: { width: number; height: number };
  region: BridgeRegion;
};

function describeRegionElement(element: { tag: string; text?: string | null }): string {
  const text = element.text?.trim();
  return text ? `${element.tag} — ${text.slice(0, 40)}` : element.tag;
}

/** Hur många markerade element som skickas som punkter i ett svep. */
const MAX_REGION_POINTS = 10;

export type { InspectMenuMode, InspectMenuState, InspectRegionState };
export { describeRegionElement, MAX_REGION_POINTS };
