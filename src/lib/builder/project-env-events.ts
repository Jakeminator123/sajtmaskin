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
