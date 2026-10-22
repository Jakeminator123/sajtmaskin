/**
 * Är Sajtagentens yta aktiverad för den här deployen? Servern vet det
 * (`OPENCLAW.surfaceEnabled` i root-layouten); klienten ska inte behöva fråga
 * `/api/openclaw/health` för att få reda på det.
 *
 * Root-layouten sätter attributet på `<body>` när ytan är på. Builderns
 * `SajtagentProvider` läser det innan den gör ett enda anrop: utan ytan finns
 * ingen agent, ingen health-koll, ingen historik och ingen befogenhets-
 * hydrering. Det håller en deploy utan OpenClaw (CI:s e2e, lokala miljöer
 * utan gateway) helt fri från extra requests vid builderns laddning.
 */

export const OPENCLAW_SURFACE_BODY_ATTR = "data-openclaw-surface";

export function isOpenClawSurfaceEnabledOnPage(): boolean {
  if (typeof document === "undefined") return false;
  return document.body?.getAttribute(OPENCLAW_SURFACE_BODY_ATTR) === "1";
}
