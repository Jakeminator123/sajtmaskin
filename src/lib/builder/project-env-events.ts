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
