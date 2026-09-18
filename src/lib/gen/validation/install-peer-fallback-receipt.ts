/**
 * Durable, files-revision-bound receipt that preview only started after
 * `--legacy-peer-deps`. Unlike a `preflight:quality-gate` advisory, a later
 * clean gate pass on the same revision must not clear this.
 */

export const INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY = "preview:install-peer-fallback" as const;

export type InstallPeerFallbackReceiptLog = {
  category?: string | null;
  meta?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeRevision(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readReceipt(log: InstallPeerFallbackReceiptLog): {
  filesRevision: string | null;
  usedFallback: boolean;
} | null {
  if (log.category !== INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY) return null;
  const meta = asRecord(log.meta);
  if (!meta) return null;
  if (typeof meta.usedFallback !== "boolean") return null;
  return {
    filesRevision: normalizeRevision(meta.filesRevision),
    usedFallback: meta.usedFallback,
  };
}

/**
 * Newest-first logs. A fallback receipt for this revision blocks until a
 * later receipt for the same revision records a strict install.
 * Missing current revision: any latest fallback receipt on the version blocks
 * (fail-closed — stamp and deploy must not disagree by omitting revision).
 */
export function installPeerFallbackReceiptBlocksPublish(
  logs: readonly InstallPeerFallbackReceiptLog[],
  filesRevision?: string | null,
): boolean {
  const currentRevision = normalizeRevision(filesRevision);
  const receipts = logs
    .map((log) => readReceipt(log))
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);
  if (receipts.length === 0) return false;
  const scoped =
    currentRevision == null
      ? receipts
      : receipts.filter((entry) => entry.filesRevision === currentRevision);
  const latest = scoped[0];
  return latest?.usedFallback === true;
}
