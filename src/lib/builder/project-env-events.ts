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
 * Ask the preview-toolbar "Byggblock" popover to open. Optional `envKeys`
 * focus the dossier owning those keys (expanded row with masked inputs) —
 * e.g. after a finalize-design 412 or from an integrations chat card.
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
 * flow. Dispatched by the persistent F3 requirements surface after it saves
 * keys, so the trigger remains the only client owner of `/finalize-design`.
 */
export const F3_REBUILD_REQUEST_EVENT = "sajtmaskin:f3-rebuild-request";

export function requestF3Rebuild(versionId?: string | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(F3_REBUILD_REQUEST_EVENT, {
      detail: { versionId: versionId ?? null },
    }),
  );
}

export type F3RequirementsDetail = {
  parentVersionId: string;
  projectId?: string | null;
  /**
   * Chat the 412 belongs to. Lets the builder ignore a late event from a
   * previous chat's stream (it would otherwise surface another project's
   * missing keys). Absent on legacy dispatches → treated as current-chat.
   */
  chatId?: string | null;
  missingByIntegration: Array<{
    key: string;
    name: string;
    missing: string[];
  }>;
};

/** Surface server-owned F3 env requirements from any client entry path. */
export const F3_REQUIREMENTS_EVENT = "sajtmaskin:f3-requirements";

export function dispatchF3Requirements(detail: F3RequirementsDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<F3RequirementsDetail>(F3_REQUIREMENTS_EVENT, { detail }),
  );
}

/**
 * Reconcile a live 412 payload against keys just saved elsewhere (e.g. the
 * Byggblock inline inputs): saved keys leave the missing lists, emptied
 * integrations drop out. Returns the same reference when nothing changed.
 * An all-clear result (empty `missingByIntegration`) is returned rather than
 * null so the requirements surface can flip to its "allt sparat — fortsätt"
 * state instead of silently disappearing.
 */
export function subtractSavedKeysFromF3Requirements(
  current: F3RequirementsDetail | null,
  savedKeys: string[],
): F3RequirementsDetail | null {
  if (!current || savedKeys.length === 0) return current;
  const saved = new Set(savedKeys.map((key) => key.trim().toUpperCase()));
  let changed = false;
  const missingByIntegration = current.missingByIntegration
    .map((entry) => {
      const missing = entry.missing.filter((key) => !saved.has(key.trim().toUpperCase()));
      if (missing.length !== entry.missing.length) changed = true;
      return { ...entry, missing };
    })
    .filter((entry) => entry.missing.length > 0);
  return changed ? { ...current, missingByIntegration } : current;
}

export function readF3RequirementsDetail(
  event: Event,
): F3RequirementsDetail | null {
  const detail = (event as CustomEvent<F3RequirementsDetail>).detail;
  if (
    !detail ||
    typeof detail.parentVersionId !== "string" ||
    !Array.isArray(detail.missingByIntegration)
  ) {
    return null;
  }
  return {
    parentVersionId: detail.parentVersionId,
    projectId:
      typeof detail.projectId === "string" && detail.projectId.trim()
        ? detail.projectId.trim()
        : null,
    chatId:
      typeof detail.chatId === "string" && detail.chatId.trim()
        ? detail.chatId.trim()
        : null,
    missingByIntegration: detail.missingByIntegration.filter(
      (entry) =>
        entry &&
        typeof entry.key === "string" &&
        typeof entry.name === "string" &&
        Array.isArray(entry.missing) &&
        entry.missing.every((key) => typeof key === "string"),
    ),
  };
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
