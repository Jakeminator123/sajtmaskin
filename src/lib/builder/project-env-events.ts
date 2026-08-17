import { describeDossierStatus } from "@/lib/builder/dossier-overview";

/**
 * Centralized window-event helpers for the builder's env/dossier surfaces.
 *
 * Ägarbeslut 2026-07-22: `ProjectEnvVarsPanel` (och dess öppna-kommandon
 * `openProjectEnvVarsPanel`/`openIntegrationsPanel`) är borttagna —
 * Byggblock-popovern (`PreviewPanelDossiers`, öppnas via
 * `openDossiersPanel`) är den enda ytan för att se status på och fylla i
 * miljövariabler, i både F2 och F3.
 *
 * Two distinct event flows live here:
 *
 * 1. **Open-panel command** (`openDossiersPanel`) — fire-and-forget signal
 *    that asks the Byggblock popover to open and focus the dossier owning
 *    the given env keys.
 *
 * 2. **Updated-notifications** (`PROJECT_ENV_VARS_UPDATED_EVENT`,
 *    `dispatchProjectEnvVarsUpdated`, `readProjectEnvVarsUpdatedDetail`) —
 *    notification dispatched after a successful env-var save (Byggblock
 *    inline inputs, kravytan) so other parts of the builder (preview
 *    view-models, readiness checks) can refresh derived state.
 */

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

/**
 * F3 outcome for the builder's discrete status row, dispatched from a lane that
 * has no access to the builder's state. The preview-panel trigger calls
 * `onStatus` directly; the chat-stream lane (`useSendMessage`, nested
 * finalize on a 409) has to go through this event.
 *
 * Fields mirror `F3BuilderStatus`; `versionId` is the version the verdict
 * judged, so the row's diagnostics link opens that version's log.
 */
export type F3StatusDetail = {
  tone: "info" | "warning" | "error" | "success";
  title: string;
  description: string;
  versionId?: string | null;
  /** Chat the verdict belongs to — a late event from a previous chat is ignored. */
  chatId?: string | null;
};

/**
 * Lucka 3 (ägarbeslut 2026-08-11): "ReleaseGate godkänd" was gate-speak —
 * users wanted to know what they GET, not the gate's name. Also merges
 * "ReleaseGate godkänd" and "ReleaseGate var redan godkänd" into one
 * phrasing: that difference was an implementation detail, not something the
 * user needs to distinguish. Count words come from `describeDossierStatus`
 * (`built-live` / `built-demo` / `blocked-build` / `planned`) — no new
 * status variant.
 *
 * Shared between `PreviewPanelF3Trigger` (which reports the initial status)
 * and `use-f3-tips-chrome.ts` (which re-derives the title reactively once
 * FRESH counts for the version this status describes arrive — Bugbot, 5th
 * pass on this diff: `PreviewPanelF3Trigger` only has access to whatever
 * dossier counts were fetched for the PARENT version before the click, never
 * the just-created/promoted F3 `versionId` this status is actually about).
 */
export function describeF3SuccessTitle(
  counts:
    | {
        builtLive: number;
        builtDemo: number;
        blockedBuild?: number;
        planned?: number;
      }
    | null
    | undefined,
): string {
  const parts: string[] = [];
  if (counts && counts.builtLive > 0) {
    parts.push(`${counts.builtLive} ${describeDossierStatus("built-live", "design").label}`);
  }
  if (counts && counts.builtDemo > 0) {
    parts.push(`${counts.builtDemo} ${describeDossierStatus("built-demo", "design").label}`);
  }
  if (counts && (counts.blockedBuild ?? 0) > 0) {
    parts.push(
      `${counts.blockedBuild} ${describeDossierStatus("blocked-build", "design").label}`,
    );
  }
  if (counts && (counts.planned ?? 0) > 0) {
    parts.push(`${counts.planned} ${describeDossierStatus("planned", "design").label}`);
  }
  return parts.length > 0
    ? `Byggblock — ${parts.join(", ")}`
    : "Integrationsbygget är klart";
}

/**
 * Re-derive a status's `title` from FRESH dossier counts, at render time,
 * instead of trusting whatever was baked in when the status was reported
 * (Bugbot, 5th pass on this diff — see `usesLiveDossierCounts`'s doc on
 * `F3BuilderStatus`). Pure so it's testable without mounting the shell hook
 * that calls it (`use-f3-tips-chrome.ts`), which owns both `status` (already
 * version-scoped there — see its `f3Status.versionId !== activeVersionId`
 * guard) and `dossierCounts` (reset on every chat/version change, only ever
 * populated by a fetch scoped to the CURRENT version).
 */
export function resolveF3StatusTitle<
  T extends { title: string; usesLiveDossierCounts?: boolean },
>(
  status: T,
  dossierCounts:
    | {
        builtLive: number;
        builtDemo: number;
        blockedBuild?: number;
        planned?: number;
      }
    | null
    | undefined,
): T {
  if (!status.usesLiveDossierCounts || !dossierCounts) return status;
  return { ...status, title: describeF3SuccessTitle(dossierCounts) };
}

export const F3_STATUS_EVENT = "sajtmaskin:f3-status";

export function dispatchF3Status(detail: F3StatusDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<F3StatusDetail>(F3_STATUS_EVENT, { detail }));
}

export function readF3StatusDetail(event: Event): F3StatusDetail | null {
  const detail = (event as CustomEvent<F3StatusDetail>).detail;
  if (
    !detail ||
    typeof detail.title !== "string" ||
    typeof detail.description !== "string" ||
    (detail.tone !== "info" &&
      detail.tone !== "warning" &&
      detail.tone !== "error" &&
      detail.tone !== "success")
  ) {
    return null;
  }
  return {
    tone: detail.tone,
    title: detail.title,
    description: detail.description,
    versionId:
      typeof detail.versionId === "string" && detail.versionId.trim()
        ? detail.versionId.trim()
        : null,
    chatId:
      typeof detail.chatId === "string" && detail.chatId.trim() ? detail.chatId.trim() : null,
  };
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
  /**
   * Epoch ms when the request that produced this 412 STARTED. Saves made
   * BEFORE this are already reflected in the server verdict and must not be
   * subtracted from it; saves made DURING the request are kept. Absent →
   * the verdict supersedes all earlier saves.
   */
  requestStartedAt?: number;
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
    ...(typeof detail.requestStartedAt === "number"
      ? { requestStartedAt: detail.requestStartedAt }
      : {}),
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
  /**
   * What happened to `envKeys`. Deletes fire the same event (consumers
   * refetch either way) but must not be mistaken for saves — e.g. the 412
   * requirements reconciliation only subtracts on "saved" (Codex P2 on
   * #525). Absent (legacy dispatchers) → treated as "saved".
   */
  action?: "saved" | "deleted";
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
    action: detail.action === "deleted" ? "deleted" : "saved",
  };
}
