/**
 * Centralized window-event helpers for the builder's project-env-vars
 * and integrations side panels.
 *
 * Two distinct event flows live here:
 *
 * 1. **Open-panel commands** (`openProjectEnvVarsPanel`,
 *    `openIntegrationsPanel`) — fire-and-forget signals that ask the
 *    `ProjectEnvVarsPanel` to open / focus a tab.
 *
 *    F2-mute semantic: `ProjectEnvVarsPanel` only mounts during the F3
 *    "Bygg integrationer" lifecycle (`lifecycleStage === "integrations"`).
 *    In F2 (design preview), the panel is not in the tree, so dispatching
 *    these events is a silent no-op. This module DOES NOT gate dispatch by
 *    lifecycle — gating is done at the call site so that F2 UI can simply
 *    hide buttons rather than show buttons that silently do nothing.
 *
 * 2. **Updated-notifications** (`PROJECT_ENV_VARS_UPDATED_EVENT`,
 *    `dispatchProjectEnvVarsUpdated`, `readProjectEnvVarsUpdatedDetail`) —
 *    notification dispatched by `ProjectEnvVarsPanel` after a successful
 *    save so other parts of the builder (preview view-models, readiness
 *    checks) can refresh derived state.
 */

export function openProjectEnvVarsPanel(envKeys?: string[]): void {
  if (typeof window === "undefined") return;
  const detail = Array.isArray(envKeys) && envKeys.length > 0 ? { envKeys } : {};
  window.dispatchEvent(new CustomEvent("project-env-vars-open", { detail }));
}

export function openIntegrationsPanel(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("integrations-panel-open"));
}

/**
 * Ask the preview-toolbar "Dossiers" popover to open, optionally highlighting a
 * set of env keys that still need real values. Unlike `ProjectEnvVarsPanel`,
 * `PreviewPanelDossiers` is mounted in the preview chrome in BOTH F2 and F3, so
 * this is the F2-safe way to route the user to a key-entry surface after a
 * finalize-design 412 or from an integration chat card.
 */
export const DOSSIERS_PANEL_OPEN_EVENT = "sajtmaskin:dossiers-panel-open";

export function openDossiersPanel(envKeys?: string[]): void {
  if (typeof window === "undefined") return;
  const detail =
    Array.isArray(envKeys) && envKeys.length > 0 ? { envKeys } : { envKeys: [] as string[] };
  window.dispatchEvent(new CustomEvent<{ envKeys: string[] }>(DOSSIERS_PANEL_OPEN_EVENT, { detail }));
}

export function readDossiersPanelOpenDetail(event: Event): { envKeys: string[] } {
  const customEvent = event as CustomEvent<{ envKeys?: unknown }>;
  const raw = customEvent.detail?.envKeys;
  const envKeys = Array.isArray(raw)
    ? raw.filter((key): key is string => typeof key === "string" && key.trim().length > 0)
    : [];
  return { envKeys };
}

/**
 * Ask `PreviewPanelF3Trigger` to re-run the "Bygg integrationer" (finalize-design)
 * flow. Dispatched by the Dossiers popover after the user fills the previously
 * missing env keys, so the single owner of the finalize logic (the trigger)
 * stays the only place that talks to `/finalize-design`.
 */
export const F3_REBUILD_REQUEST_EVENT = "sajtmaskin:f3-rebuild-request";

export function requestF3Rebuild(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(F3_REBUILD_REQUEST_EVENT));
}

/**
 * Fired whenever `versionStatusNonce` bumps (a generation's post-check flow
 * finished — see `useVersionStatus`/`runPostGenerationChecks`). Lets
 * `PreviewPanelDossiers` refetch its wired-dossier overview while the
 * popover stays open across a new version landing, without threading the
 * nonce itself through the preview-panel prop chain.
 */
export const VERSION_STATUS_REFRESHED_EVENT = "sajtmaskin:version-status-refreshed";

export function dispatchVersionStatusRefreshed(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(VERSION_STATUS_REFRESHED_EVENT));
}

export const PROJECT_ENV_VARS_UPDATED_EVENT = "sajtmaskin:project-env-vars-updated";

export type ProjectEnvVarsUpdatedDetail = {
  projectId: string;
  chatId?: string | null;
  versionId?: string | null;
  envKeys?: string[];
};

export function dispatchProjectEnvVarsUpdated(detail: ProjectEnvVarsUpdatedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ProjectEnvVarsUpdatedDetail>(PROJECT_ENV_VARS_UPDATED_EVENT, {
      detail,
    }),
  );
}

export function readProjectEnvVarsUpdatedDetail(
  event: Event,
): ProjectEnvVarsUpdatedDetail | null {
  const customEvent = event as CustomEvent<ProjectEnvVarsUpdatedDetail>;
  const detail = customEvent.detail;
  if (!detail || typeof detail.projectId !== "string" || detail.projectId.trim().length === 0) {
    return null;
  }
  return {
    projectId: detail.projectId.trim(),
    chatId:
      typeof detail.chatId === "string" && detail.chatId.trim().length > 0
        ? detail.chatId.trim()
        : null,
    versionId:
      typeof detail.versionId === "string" && detail.versionId.trim().length > 0
        ? detail.versionId.trim()
        : null,
    envKeys: Array.isArray(detail.envKeys)
      ? detail.envKeys.filter((key): key is string => typeof key === "string" && key.trim().length > 0)
      : [],
  };
}
