/**
 * Durable install-proof receipt that preview only started after
 * `--legacy-peer-deps`. Unlike a `preflight:quality-gate` advisory, a later
 * clean gate pass must not clear this.
 *
 * Proof is bound to the **dependency fingerprint** (install policy +
 * package.json + lockfiles), not the full `files_revision`. A page.tsx edit
 * keeps the same block; a package.json/lockfile change needs new proof.
 *
 * Outcomes: `fallback` | `strict_pass` | `skipped`. Only a real strict
 * install success may clear a fallback receipt.
 */

import { createHash } from "node:crypto";

export const INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY = "preview:install-peer-fallback" as const;

/**
 * Must stay in lockstep with `DEPENDENCY_INSTALL_POLICY` in
 * `preview-host/src/runtime/package-install.js`.
 */
export const INSTALL_DEPENDENCY_POLICY_TOKEN = "2026-07-13-dev-deps-local-toolchain";

const DEPENDENCY_FINGERPRINT_KEYS = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
] as const;

export const PREVIEW_INSTALL_KINDS = ["fallback", "strict_pass", "skipped"] as const;
export type PreviewInstallKind = (typeof PREVIEW_INSTALL_KINDS)[number];

export type InstallPeerFallbackReceiptLog = {
  category?: string | null;
  meta?: unknown;
};

export type InstallPeerFallbackReceiptScope = {
  filesRevision?: string | null;
  dependencyFingerprint?: string | null;
  files?: ReadonlyArray<{ path: string; content: string }>;
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

function normalizeFileKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Same sha256 as preview-host `dependencyFingerprint(filesJson)`. */
export function dependencyFingerprintFromFiles(
  files: ReadonlyArray<{ path: string; content: string }>,
): string {
  const byKey = new Map<string, string>();
  for (const file of files) {
    const key = normalizeFileKey(file.path);
    if ((DEPENDENCY_FINGERPRINT_KEYS as readonly string[]).includes(key)) {
      byKey.set(key, file.content);
    }
  }
  const hash = createHash("sha256");
  hash.update("policy:");
  hash.update(INSTALL_DEPENDENCY_POLICY_TOKEN);
  hash.update("\n");
  for (const key of DEPENDENCY_FINGERPRINT_KEYS) {
    const content = byKey.get(key);
    if (typeof content === "string") {
      hash.update(key);
      hash.update("\n");
      hash.update(content);
      hash.update("\n");
    }
  }
  return hash.digest("hex");
}

function resolveScope(
  scope?: string | null | InstallPeerFallbackReceiptScope,
): { filesRevision: string | null; dependencyFingerprint: string | null } {
  if (scope == null || typeof scope === "string") {
    return { filesRevision: normalizeRevision(scope), dependencyFingerprint: null };
  }
  const fromFiles = scope.files ? dependencyFingerprintFromFiles(scope.files) : null;
  return {
    filesRevision: normalizeRevision(scope.filesRevision),
    dependencyFingerprint: normalizeRevision(scope.dependencyFingerprint) ?? fromFiles,
  };
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
  dependencyFingerprint: string | null;
  kind: PreviewInstallKind;
} | null {
  if (log.category !== INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY) return null;
  const kind = readInstallPeerFallbackReceiptKind(log.meta);
  if (!kind) return null;
  const meta = asRecord(log.meta);
  return {
    filesRevision: normalizeRevision(meta?.filesRevision),
    dependencyFingerprint: normalizeRevision(meta?.dependencyFingerprint),
    kind,
  };
}

function latestDecisive(
  receipts: ReadonlyArray<{ kind: PreviewInstallKind }>,
): PreviewInstallKind | null {
  const latest = receipts.find(
    (entry) => entry.kind === "fallback" || entry.kind === "strict_pass",
  );
  return latest?.kind ?? null;
}

/**
 * Newest-first logs. A fallback receipt for this **dependency fingerprint**
 * blocks until a later receipt for the same fingerprint records `strict_pass`.
 * Skipped / unknown receipts never decide the gate.
 *
 * Unfingerprinted legacy receipts fail-closed onto the current fingerprint
 * until a fingerprinted strict_pass exists. Missing current fingerprint and
 * missing filesRevision: any latest fallback on the version blocks.
 */
export function installPeerFallbackReceiptBlocksPublish(
  logs: readonly InstallPeerFallbackReceiptLog[],
  scope?: string | null | InstallPeerFallbackReceiptScope,
): boolean {
  const { filesRevision, dependencyFingerprint } = resolveScope(scope);
  const receipts = logs
    .map((log) => readReceipt(log))
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);
  if (dependencyFingerprint) {
    const fingerprinted = receipts.filter(
      (entry) => entry.dependencyFingerprint === dependencyFingerprint,
    );
    const fingerprintedKind = latestDecisive(fingerprinted);
    if (fingerprintedKind) return fingerprintedKind === "fallback";
    const legacy = receipts.filter((entry) => entry.dependencyFingerprint == null);
    return latestDecisive(legacy) === "fallback";
  }
  const scoped =
    filesRevision == null
      ? receipts
      : receipts.filter((entry) => entry.filesRevision === filesRevision);
  return latestDecisive(scoped) === "fallback";
}
