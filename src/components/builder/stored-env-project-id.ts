type ProjectIds = {
  appProjectId?: string | null;
  externalProjectId?: string | null;
};

/**
 * Stored environment variables are owned by the Sajtmaskin app project.
 * The external/V0 project id is intentionally never used as a fallback.
 */
export function resolveStoredEnvProjectId({ appProjectId }: ProjectIds): string | null {
  const normalized = appProjectId?.trim();
  return normalized ? normalized : null;
}
