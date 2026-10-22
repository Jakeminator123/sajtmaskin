import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";

const MIN_AGE_MS = 5 * 60_000;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const RETRY_INTERVAL_MS = 60_000;

/** A wake-up hint only. All eligibility, identity and budget decisions stay server-side. */
export function createPostcheckRecovery(chatId: string) {
  let lastAttemptAt = -Infinity;
  let inFlight = false;
  return async (payload: unknown): Promise<void> => {
    const rows = (payload as { versions?: unknown[] } | undefined)?.versions;
    if (!Array.isArray(rows) || !rows.length || inFlight) return;
    const versions = rows as Array<Record<string, unknown>>;
    // Never recover an older pending row behind a terminal or manually edited head.
    if (versions.some(v => !v || !Number.isSafeInteger(v.versionNumber))) return;
    const latest = versions.reduce((a, b) => Number(a.versionNumber) > Number(b.versionNumber) ? a : b);
    const now = Date.now();
    const age = now - Date.parse(String(latest.createdAt ?? ""));
    if (typeof latest.id !== "string" || !latest.id || latest.releaseState !== "draft" ||
        !["pending", "verifying", "repairing"].includes(String(latest.verificationState)) ||
        latest.lifecycleStage !== "design" || (latest.editKind !== null && latest.editKind !== "imported_repo") ||
        latest.hasPendingRepair !== false || !Number.isFinite(age) || age < MIN_AGE_MS || age > MAX_AGE_MS ||
        now - lastAttemptAt < RETRY_INTERVAL_MS) return;
    lastAttemptAt = now;
    inFlight = true;
    try {
      await fetch(`${engineChatBaseUrl(chatId)}/postchecks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: latest.id }), signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Keep rendering persisted status; a future successful versions poll may retry.
    } finally {
      inFlight = false;
    }
  };
}
