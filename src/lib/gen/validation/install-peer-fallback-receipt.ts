/**
 * Durable, files-revision-bound receipt that preview only started after
 * `--legacy-peer-deps`. Unlike a `preflight:quality-gate` advisory, a later
 * clean gate pass on the same revision must not clear this.
 *
 * Install outcomes are three-way: `fallback`, `strict_pass`, or `skipped`.
 * Only a real strict install success may clear a fallback receipt. A later
 * skip (same dependency fingerprint, no npm install) is not proof.
 */

export const INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY = "preview:install-peer-fallback" as const;

export const PREVIEW_INSTALL_KINDS = ["fallback", "strict_pass", "skipped"] as const;
export type PreviewInstallKind = (typeof PREVIEW_INSTALL_KINDS)[number];

export type InstallPeerFallbackReceiptLog = {
  category?: string | null;
  meta?: unknown;
};

export function isPreviewInstallKind(value: unknown): value is PreviewInstallKind {
  return value === "fallback" || value === "strict_pass" || value === "skipped";
}

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

/**
 * Host `/status` may send `installKind` explicitly. Older hosts only sent the
 * two fallback booleans — those still mean `fallback`. Missing flags are
 * unknown, not a strict pass.
 */
export function previewInstallKindFromHostStatus(input: {
  installKind?: unknown;
  usedLegacyPeerDeps?: boolean;
  peerConflictDetected?: boolean;
}): PreviewInstallKind | null {
  if (isPreviewInstallKind(input.installKind)) return input.installKind;
  if (input.usedLegacyPeerDeps === true && input.peerConflictDetected === true) {
    return "fallback";
  }
  return null;
}

/**
 * Receipt kind. Legacy `usedFallback: true` still blocks. Legacy
 * `usedFallback: false` is treated as skipped — that boolean used to be
 * written after a fingerprint skip, which is not a strict install.
 */
export function readInstallPeerFallbackReceiptKind(
  meta: unknown,
): PreviewInstallKind | null {
  const record = asRecord(meta);
  if (!record) return null;
  if (isPreviewInstallKind(record.kind)) return record.kind;
  if (record.usedFallback === true) return "fallback";
  if (record.usedFallback === false) return "skipped";
  return null;
}

function readReceipt(log: InstallPeerFallbackReceiptLog): {
  filesRevision: string | null;
  kind: PreviewInstallKind;
} | null {
  if (log.category !== INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY) return null;
  const kind = readInstallPeerFallbackReceiptKind(log.meta);
  if (!kind) return null;
  const meta = asRecord(log.meta);
  return {
    filesRevision: normalizeRevision(meta?.filesRevision),
    kind,
  };
}

/**
 * Newest-first logs. A fallback receipt for this revision blocks until a
 * later receipt for the same revision records a real `strict_pass`.
 * Skipped / unknown receipts never decide the gate.
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
  const scoped =
    currentRevision == null
      ? receipts
      : receipts.filter((entry) => entry.filesRevision === currentRevision);
  const latestDecisive = scoped.find(
    (entry) => entry.kind === "fallback" || entry.kind === "strict_pass",
  );
  return latestDecisive?.kind === "fallback";
}
