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

function normalizeMutationRevision(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function normalizeInstallAttemptRevision(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function normalizeLifecycleToken(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Host and app both use sha256 hex. Anything else is not install-proof. */
export function normalizeDependencyFingerprint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(trimmed) ? trimmed : null;
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
    dependencyFingerprint:
      normalizeDependencyFingerprint(scope.dependencyFingerprint) ?? fromFiles,
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
  lifecycleToken: string | null;
  mutationRevision: number | null;
  installAttemptRevision: number | null;
} | null {
  if (log.category !== INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY) return null;
  const kind = readInstallPeerFallbackReceiptKind(log.meta);
  if (!kind) return null;
  const meta = asRecord(log.meta);
  return {
    filesRevision: normalizeRevision(meta?.filesRevision),
    dependencyFingerprint: normalizeDependencyFingerprint(meta?.dependencyFingerprint),
    kind,
    lifecycleToken: normalizeLifecycleToken(meta?.lifecycleToken),
    mutationRevision: normalizeMutationRevision(meta?.mutationRevision),
    installAttemptRevision: normalizeInstallAttemptRevision(meta?.installAttemptRevision),
  };
}

function latestDecisive(
  receipts: ReadonlyArray<{
    kind: PreviewInstallKind;
    lifecycleToken: string | null;
    mutationRevision: number | null;
    installAttemptRevision: number | null;
  }>,
): PreviewInstallKind | null {
  const decisive = receipts.filter(
    (entry) => entry.kind === "fallback" || entry.kind === "strict_pass",
  );
  const latest = decisive[0];
  if (!latest) return null;

  const latestAttemptDecision = (
    comparable: typeof decisive,
  ): PreviewInstallKind => {
    const orderedAttempts = comparable.filter(
      (entry) => entry.installAttemptRevision !== null,
    );
    if (orderedAttempts.length === 0) return comparable[0]?.kind ?? latest.kind;
    const greatestAttempt = orderedAttempts.reduce((current, entry) =>
      (entry.installAttemptRevision ?? 0) > (current.installAttemptRevision ?? 0)
        ? entry
        : current,
    );
    // Once attempt-ordered evidence exists, receipts without an attempt are
    // incomparable: DB insertion order is not causal order. Any such fallback
    // therefore remains blocking until a later comparable mutation supersedes
    // it. An unordered strict acknowledgement also cannot clear an ordered
    // fallback.
    if (
      greatestAttempt.kind === "fallback" ||
      comparable.some(
        (entry) =>
          entry.installAttemptRevision === null && entry.kind === "fallback",
      )
    ) {
      return "fallback";
    }
    return "strict_pass";
  };

  if (latest.mutationRevision === null) {
    // A recovered legacy session may lack mutationRevision even on a new host.
    // In that case attempt order is still authoritative within its lifecycle;
    // different lifecycles remain newest-first because their attempt counters
    // are not comparable.
    const mutationless = decisive.filter((entry) => entry.mutationRevision === null);
    const hasAttemptOrder = mutationless.some(
      (entry) => entry.installAttemptRevision !== null,
    );
    let mutationlessKind: PreviewInstallKind;
    if (!hasAttemptOrder) {
      mutationlessKind = mutationless[0]?.kind ?? latest.kind;
    } else {
      // Attempt counters are scoped to a lifecycle. Different lifecycles are
      // incomparable when mutationRevision is absent, so any lifecycle whose
      // own latest/ordered evidence is fallback must fail closed.
      const byLifecycle = new Map<string | null, typeof mutationless>();
      for (const entry of mutationless) {
        const group = byLifecycle.get(entry.lifecycleToken) ?? [];
        group.push(entry);
        byLifecycle.set(entry.lifecycleToken, group);
      }
      mutationlessKind = [...byLifecycle.values()].some(
        (group) => latestAttemptDecision(group) === "fallback",
      )
        ? "fallback"
        : "strict_pass";
    }
    // An unordered/mutation-less strict acknowledgement cannot safely clear a
    // receipt from a known later mutation.
    if (
      mutationlessKind === "strict_pass" &&
      decisive.some(
        (entry) => entry.kind === "fallback" && entry.mutationRevision !== null,
      )
    ) {
      return "fallback";
    }
    return mutationlessKind;
  }
  // Logs are normally newest-first, but asynchronous status acknowledgements
  // may be persisted out of arrival order. mutationRevision orders file/session
  // mutations; installAttemptRevision orders recovery boots of the SAME mutation.
  const greatestMutation = decisive.reduce(
    (current, entry) =>
      entry.mutationRevision !== null && entry.mutationRevision > current
        ? entry.mutationRevision
        : current,
    latest.mutationRevision,
  );
  const sameMutation = decisive.filter(
    (entry) => entry.mutationRevision === greatestMutation,
  );
  return latestAttemptDecision(sameMutation);
}

/**
 * Newest-first logs. A fallback receipt for this **dependency fingerprint**
 * blocks until a later receipt for the same fingerprint records `strict_pass`.
 * Skipped / unknown receipts never decide the gate.
 *
 * Unfingerprinted legacy fallback fail-closes onto the current fingerprint
 * until a **fingerprinted** strict_pass exists. An unfingerprinted
 * `strict_pass` never clears. Missing current fingerprint and missing
 * filesRevision: any latest fallback on the version blocks.
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
    return receipts.some(
      (entry) => entry.dependencyFingerprint == null && entry.kind === "fallback",
    );
  }
  const scoped =
    filesRevision == null
      ? receipts
      : receipts.filter((entry) => entry.filesRevision === filesRevision);
  return latestDecisive(scoped) === "fallback";
}
