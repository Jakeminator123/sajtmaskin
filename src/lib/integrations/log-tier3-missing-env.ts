/**
 * R7 — persist the link from an observed F3 412 (missing env) to
 * chatId / versionId / missingByIntegration so `/logg` can reconstruct
 * the requirements surface without an open browser.
 *
 * Best-effort only: never throw, never delay the 412 response on failure.
 * Uses `createEngineVersionErrorLogs` directly (not the build-error bus)
 * so an expected gate denial does not look like a pipeline crash.
 */
import { after } from "next/server";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";

export const F3_READINESS_MISSING_ENV_CATEGORY = "f3-readiness:missing-env";

export type Tier3MissingEnvSource =
  | "finalize-design"
  | "quality-gate"
  | "stream";

export type Tier3MissingByIntegration = Array<{
  key: string;
  name: string;
  missing: string[];
}>;

export interface LogTier3MissingEnvParams {
  chatId: string;
  /** Design/parent version the 412 response already exposes. */
  versionId: string;
  projectId?: string | null;
  missingByIntegration: Tier3MissingByIntegration;
  source: Tier3MissingEnvSource;
  /** Quality-gate only: internal F3 fork id when distinct from parent. */
  f3VersionId?: string | null;
  /** Optional advisory lock timeout (quality-gate lease contention). */
  lockTimeoutMs?: number;
}

function summarizeMissingKeys(
  missingByIntegration: Tier3MissingByIntegration,
): string {
  const keys = missingByIntegration.flatMap((entry) =>
    Array.isArray(entry.missing) ? entry.missing : [],
  );
  const unique = Array.from(new Set(keys.map((key) => key.trim()).filter(Boolean)));
  if (unique.length === 0) return "(inga nycklar listade)";
  if (unique.length <= 4) return unique.join(", ");
  return `${unique.slice(0, 4).join(", ")} (+${unique.length - 4} till)`;
}

/** Build the durable message — exported for unit tests. */
export function formatTier3MissingEnvMessage(
  missingByIntegration: Tier3MissingByIntegration,
): string {
  return `Integrationsbygget spärrat: saknar ${summarizeMissingKeys(missingByIntegration)}`;
}

/**
 * Persist a durable observation of a 412 missing-env gate. Awaitable — the
 * 412 callsites use {@link logTier3MissingEnvBlockedDetached} instead.
 */
export async function logTier3MissingEnvBlocked(
  params: LogTier3MissingEnvParams,
): Promise<void> {
  const chatId = params.chatId?.trim();
  const versionId = params.versionId?.trim();
  if (!chatId || !versionId) return;

  const missingByIntegration = Array.isArray(params.missingByIntegration)
    ? params.missingByIntegration
    : [];

  try {
    await createEngineVersionErrorLogs(
      [
        {
          chatId,
          versionId,
          level: "info",
          category: F3_READINESS_MISSING_ENV_CATEGORY,
          message: formatTier3MissingEnvMessage(missingByIntegration),
          meta: {
            error: "tier3_env_not_ready",
            source: params.source,
            projectId: params.projectId ?? null,
            missingByIntegration,
            f3VersionId: params.f3VersionId ?? null,
            observedAt: new Date().toISOString(),
          },
        },
      ],
      params.lockTimeoutMs != null
        ? { lockTimeoutMs: params.lockTimeoutMs }
        : undefined,
    );
  } catch (err) {
    console.warn(
      "[f3-readiness] Failed to persist missing-env observation (best-effort):",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Schedule the observation without delaying the 412 response.
 *
 * A bare `void logTier3MissingEnvBlocked(...)` before `return` is not enough on
 * serverless: the invocation can freeze the moment the response is returned, and
 * the detached INSERT then dies silently — the same failure mode that lost
 * `preview_url` writes (see `keepWriteAlive` in `observability/llm-usage.ts`).
 * `after()` hands the promise to the platform instead.
 *
 * Outside a request scope (scripts, tests) `after()` throws; there is no
 * invocation that can freeze there, so plain fire-and-forget is correct.
 */
export function logTier3MissingEnvBlockedDetached(
  params: LogTier3MissingEnvParams,
): void {
  const pending = logTier3MissingEnvBlocked(params);
  try {
    after(pending);
  } catch {
    void pending;
  }
}
