#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SKILL_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const DEFAULT_BACKLOG = resolve(SKILL_ROOT, "..", "..", "..", "BUG-SWARM-BACKLOG.md");
const STATE_VERSION = 5;
const LEGACY_STATE_VERSIONS = new Set([3, 4]);
const DEFAULT_COOLDOWN_MINUTES = 5;
const DEFAULT_LEASE_MINUTES = 240;
const GIT_EVIDENCE_TIMEOUT_MS = 5_000;
const GH_EVIDENCE_TIMEOUT_MS = 30_000;
const MAX_EVIDENCE_AGE_MS = 2 * 60_000;
const MAX_EVIDENCE_FUTURE_SKEW_MS = 30_000;
const DELIVERY_BASE = "preview";
const WORKFLOW_POLICY_PATH = "config/agent-workflow.json";

export const STAGES = Object.freeze([
  "claimed",
  "verified",
  "investigated",
  "worktree-ready",
  "implemented",
  "reviewed",
  "draft-pr",
  "ci-review",
  "ready-to-merge",
  "merged",
  "cleanup",
]);

const MODES = new Set(["pilot", "evaluation", "full"]);
const FULL_OUTCOMES = new Set(["fixed", "already-resolved", "reclassified"]);
const EVALUATION_OUTCOMES = new Set(["draft-fix", "draft-already-resolved", "draft-reclassified"]);
const REVIEW_SOURCES = new Set(["independent-agent", "bugbot", "bugbot-local", "codex", "manual"]);
const RETIRED_REVIEW_SOURCES = new Set(["pr-ai-review"]);
const REVIEW_VERDICTS = new Set(["clean", "findings-fixed", "blocked"]);
const SHA_PATTERN = /^[a-f0-9]{40}$/iu;
const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/iu;
const BRANCH_PATTERN = /^(?:fix|feat|docs|chore)\/[a-z0-9][a-z0-9._/-]*$/u;
const REPOSITORY_PATTERN = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu;
const DRAFT_ONLY_CEILING = STAGES.indexOf("draft-pr");
export const EVALUATION_TITLE_PREFIX = "[DO NOT MERGE — ADMIN REVIEW REQUIRED]";
export const EVALUATION_BODY_MARKER = "AUTOMATED GODNATT-BUGG EVALUATION.";
export const INDEPENDENT_REVIEW_PROCEDURE = "oberoende bugggranskning";
export const INDEPENDENT_REVIEW_MODEL = "gpt-5.6-sol";

export class RunStateError extends Error {
  constructor(message, code = 2, details = undefined) {
    super(message);
    this.name = "RunStateError";
    this.code = code;
    this.details = details;
  }
}

/** Parse only unchecked records from the canonical `## Aktiv kö` table. */
export function parseActiveQueue(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^##\s+Aktiv\s+k(?:ö|o)\s*$/iu.test(line.trim()));
  if (start === -1) throw new RunStateError("BUG-SWARM-BACKLOG.md saknar sektionen ## Aktiv kö.");

  const endRelative = lines.slice(start + 1).findIndex((line) => /^##\s+/u.test(line.trim()));
  const end = endRelative === -1 ? lines.length : start + 1 + endRelative;
  const rows = [];

  for (const rawLine of lines.slice(start + 1, end)) {
    const line = rawLine.trim();
    if (!line.startsWith("| [")) continue;
    const cells = line
      .slice(1, line.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 6 || !/^\[\s*\]$/u.test(cells[0])) continue;

    const [checkbox, status, priority, finding, source, nextStep] = cells;
    const idMatch = /^`(SM-\d{3})`\s+/u.exec(finding);
    if (!idMatch) throw new RunStateError(`Aktiv kö-rad saknar stabilt SM-id: ${finding}`);

    const id = idMatch[1];
    const remainder = finding.slice(idMatch[0].length);
    const boldTitle = /^\*\*(.*?)\*\*/u.exec(remainder);
    const title = (boldTitle?.[1] ?? remainder.split(":")[0]).replace(/:\s*$/u, "").trim();
    rows.push({ id, checkbox, status, priority, title, finding, source, nextStep });
  }

  const duplicates = rows.filter(
    (row, index) => rows.findIndex((other) => other.id === row.id) !== index,
  );
  if (duplicates.length > 0) {
    throw new RunStateError(
      `Dubbla SM-id:n i Aktiv kö: ${[...new Set(duplicates.map((r) => r.id))].join(", ")}`,
    );
  }
  return rows;
}

export function createRunState({
  count,
  mode,
  cooldownMinutes,
  leaseMinutes,
  now,
  runId,
  promotionCode = null,
  automationId = null,
  trustedRolloutEvidence = null,
}) {
  if (!Number.isInteger(count) || count < 1 || count > 25) {
    throw new RunStateError("count måste vara ett heltal mellan 1 och 25.");
  }
  if (!MODES.has(mode)) throw new RunStateError(`Okänt mode: ${mode}`);
  if (mode === "pilot" && count !== 1) {
    throw new RunStateError("pilot mode stöder exakt ett pass; använd full för batch.");
  }
  if (mode === "pilot" && !promotionCode?.trim()) {
    throw new RunStateError("pilot mode kräver en promotion capability.");
  }
  if (automationId !== null && !/^[a-z0-9][a-z0-9-]{1,63}$/u.test(automationId)) {
    throw new RunStateError("automation-id måste vara ett stabilt slug-id.");
  }
  if (!Number.isFinite(cooldownMinutes) || cooldownMinutes < 5 || cooldownMinutes > 1440) {
    throw new RunStateError("cooldown-minutes måste vara mellan 5 och 1440.");
  }
  if (!Number.isFinite(leaseMinutes) || leaseMinutes < 5 || leaseMinutes > 1440) {
    throw new RunStateError("lease-minutes måste vara mellan 5 och 1440.");
  }

  const timestamp = toIso(now);
  const rolloutEvidence =
    mode === "full" ? validateFullRolloutEvidence(trustedRolloutEvidence, now) : null;
  return {
    version: STATE_VERSION,
    runId,
    mode,
    automationId,
    promotionAuthorizationHash:
      mode === "pilot" ? createHash("sha256").update(promotionCode).digest("hex") : null,
    requestedPasses: count,
    completedPasses: 0,
    mergedPasses: 0,
    draftPasses: 0,
    remainingPasses: count,
    cooldownMinutes,
    leaseMinutes,
    status: "ready",
    createdAt: timestamp,
    updatedAt: timestamp,
    notBefore: null,
    pauseReason: null,
    fullRolloutEvidence: rolloutEvidence,
    lease: null,
    current: null,
    history: [],
  };
}

export function acquireLease(state, { now, token = randomUUID(), trustedRolloutEvidence = null }) {
  const next = normalizeState(state);
  assertRunnableState(next);
  const timestamp = toIso(now);
  const nowMs = Date.parse(timestamp);

  if (next.status === "cooldown" && next.notBefore && Date.parse(next.notBefore) > nowMs) {
    throw new RunStateError("Batchen är i cooldown.", 5, { notBefore: next.notBefore });
  }
  if (next.lease) {
    if (Date.parse(next.lease.expiresAt) > nowMs) {
      throw new RunStateError("En annan runner håller en aktiv lease.", 3, {
        acquiredAt: next.lease.acquiredAt,
        expiresAt: next.lease.expiresAt,
      });
    }
    throw new RunStateError("Runner-leasen har gått ut och måste återställas uttryckligen.", 6, {
      expiredAt: next.lease.expiresAt,
      recoverCommand: `recover --run-id ${next.runId} --reason <kontrollerad-orsak>`,
    });
  }
  if (next.mode === "full") {
    next.fullRolloutEvidence = validateFullRolloutEvidence(trustedRolloutEvidence, now);
  }

  next.status = "running";
  next.notBefore = null;
  next.lease = {
    tokenHash: hashToken(token),
    acquiredAt: timestamp,
    heartbeatAt: timestamp,
    expiresAt: addMinutes(timestamp, next.leaseMinutes),
  };
  next.updatedAt = timestamp;
  return { state: next, token };
}

export function recoverStaleLease(state, { runId, reason, now }) {
  const next = normalizeState(state);
  assertRunId(next, runId);
  if (!reason?.trim()) throw new RunStateError("recover kräver --reason.");
  if (!next.lease) throw new RunStateError("Det finns ingen lease att återställa.");
  if (Date.parse(next.lease.expiresAt) > Date.parse(toIso(now))) {
    throw new RunStateError("Leasen är fortfarande aktiv och får inte tas över.", 3, {
      expiresAt: next.lease.expiresAt,
    });
  }
  next.history.push({
    kind: "lease-recovered",
    at: toIso(now),
    reason: reason.trim(),
    previousLease: next.lease,
  });
  next.lease = null;
  next.status = "ready";
  next.updatedAt = toIso(now);
  return next;
}

export function claimCandidate(state, { token, smId, candidates, now }) {
  const next = normalizeState(state);
  assertLease(next, token, now);
  if (!/^SM-\d{3}$/u.test(smId ?? "")) throw new RunStateError("claim kräver ett giltigt --sm-id.");
  const candidate = candidates.find((row) => row.id === smId);
  if (!candidate) throw new RunStateError(smId + " finns inte i dagens ## Aktiv kö.");
  if (next.history.some((entry) => entry.item?.smId === smId)) {
    throw new RunStateError(
      smId + " har redan behandlats i den här batchen; välj en annan kandidat.",
    );
  }
  if (next.current) {
    if (next.current.smId === smId) return next;
    throw new RunStateError(
      `Runnen äger redan ${next.current.smId}; slutför eller pausa den först.`,
    );
  }
  next.current = {
    smId,
    title: candidate.title,
    priority: candidate.priority,
    stage: "claimed",
    claimedAt: toIso(now),
    branch: null,
    worktree: null,
    prNumber: null,
    headSha: null,
    mergeSha: null,
    reviewPasses: [],
    isDraft: null,
    mergeForbidden: null,
    adminReviewRequired: null,
    prTitlePrefix: null,
    prBodyMarker: null,
    blockingLabel: null,
    repository: null,
    deliveryBase: null,
    baseSha: null,
    legacyRebaselineRequired: false,
    legacySourceVersion: null,
    deliveryEvidence: {
      draftPr: null,
      latestOpen: null,
      readyToMerge: null,
      reviewed: null,
      merged: null,
      cleanup: null,
      completed: null,
      legacyRebaseline: null,
    },
    note: null,
  };
  next.updatedAt = toIso(now);
  return next;
}

export function advanceStage(state, { token, stage, now, metadata = {}, trustedEvidence = null }) {
  const next = normalizeState(state);
  assertLease(next, token, now);
  if (!next.current) throw new RunStateError("Ingen kandidat är claimad.");
  const oldIndex = STAGES.indexOf(next.current.stage);
  const newIndex = STAGES.indexOf(stage);
  if (newIndex === -1) throw new RunStateError(`Okänt stage: ${stage}`);
  if (newIndex < oldIndex) {
    throw new RunStateError(`Stage får inte gå bakåt (${next.current.stage} -> ${stage}).`);
  }
  if (newIndex > oldIndex + 1) {
    throw new RunStateError(
      "Stage får inte hoppas över (" + next.current.stage + " -> " + stage + ").",
    );
  }
  if (next.mode !== "full" && newIndex > DRAFT_ONLY_CEILING) {
    throw new RunStateError(
      next.mode === "evaluation"
        ? "Evaluation mode får aldrig gå förbi draft-pr eller nå merge-stages."
        : "Pilot mode får inte gå förbi draft-pr; uttrycklig capability-promotion krävs.",
      8,
    );
  }
  assertNoUntrustedDeliveryMetadata(metadata);
  next.current.stage = stage;
  for (const key of ["branch", "worktree"]) {
    if (
      metadata[key] !== undefined &&
      next.current[key] !== null &&
      metadata[key] !== next.current[key]
    ) {
      throw new RunStateError(`${key} är immutable efter första registreringen.`);
    }
  }
  assertUniquePassEvidence(next, {
    branch: metadata.branch ?? next.current.branch,
    prNumber: trustedEvidence?.prNumber ?? next.current.prNumber,
  });
  for (const key of ["branch", "worktree", "note"]) {
    if (metadata[key] !== undefined) next.current[key] = metadata[key];
  }
  applyStageEvidence(next.current, next.mode, stage, trustedEvidence, now);
  validateStageEvidence(next.current, next.mode);
  next.updatedAt = toIso(now);
  next.lease.heartbeatAt = toIso(now);
  next.lease.expiresAt = addMinutes(next.lease.heartbeatAt, next.leaseMinutes);
  return next;
}

export function reopenReview(state, { token, reason, now, trustedEvidence = null }) {
  const next = normalizeState(state);
  assertLease(next, token, now);
  if (next.mode !== "full" || next.current?.stage !== "ready-to-merge") {
    throw new RunStateError("re-review kräver full mode i ready-to-merge.", 8);
  }
  if (!reason?.trim()) throw new RunStateError("re-review kräver --reason.");
  const evidence = validateDeliveryEvidence(next.current, trustedEvidence, {
    now,
    allowRevisionUpdate: true,
    priorObservedAt: latestEvidenceObservedAt(next.current),
  });
  requirePullRequestState(evidence, {
    state: "OPEN",
    isDraft: false,
    stage: "re-review",
  });
  const headChanged = evidence.headRefOid !== next.current.headSha;
  const baseChanged = evidence.liveBaseSha !== next.current.baseSha;
  if (!headChanged && !baseChanged) {
    throw new RunStateError("re-review kräver faktiskt ändrad head- eller live base-SHA.", 8);
  }
  const timestamp = toIso(now);
  next.history.push({
    kind: "review-reopened",
    at: timestamp,
    reason: reason.trim(),
    prNumber: next.current.prNumber,
    branch: next.current.branch,
    worktree: next.current.worktree,
    previousHeadSha: next.current.headSha,
    previousBaseSha: next.current.baseSha,
    nextHeadSha: evidence.headRefOid,
    nextBaseSha: evidence.liveBaseSha,
    previousReadyEvidence: next.current.deliveryEvidence.readyToMerge,
  });
  next.current.stage = "ci-review";
  next.current.headSha = evidence.headRefOid;
  next.current.baseSha = evidence.liveBaseSha;
  next.current.isDraft = false;
  next.current.deliveryEvidence.readyToMerge = null;
  next.current.deliveryEvidence.reviewed = null;
  next.current.deliveryEvidence.latestOpen = evidence;
  validateStageEvidence(next.current, next.mode);
  next.updatedAt = timestamp;
  next.lease.heartbeatAt = timestamp;
  next.lease.expiresAt = addMinutes(timestamp, next.leaseMinutes);
  return next;
}

export function rebaselineLegacyState(state, { token, reason, now, trustedEvidence = null }) {
  const next = normalizeState(state);
  assertLease(next, token, now);
  const stageIndex = STAGES.indexOf(next.current?.stage);
  if (
    next.mode !== "full" ||
    !next.current ||
    next.current.legacyRebaselineRequired !== true ||
    stageIndex < STAGES.indexOf("ci-review")
  ) {
    throw new RunStateError(
      "rebaseline-legacy kräver ett migrerat legacy full-state från ci-review eller senare.",
      8,
    );
  }
  if (!reason?.trim()) throw new RunStateError("rebaseline-legacy kräver --reason.");
  const evidence = validateDeliveryEvidence(next.current, trustedEvidence, {
    now,
    allowRevisionUpdate: false,
    priorObservedAt: latestEvidenceObservedAt(next.current),
  });
  requirePullRequestState(evidence, {
    state: "OPEN",
    isDraft: true,
    stage: "rebaseline-legacy",
  });
  const timestamp = toIso(now);
  next.history.push({
    kind: "legacy-rebaselined",
    at: timestamp,
    reason: reason.trim(),
    sourceVersion: next.current.legacySourceVersion,
    prNumber: next.current.prNumber,
    branch: next.current.branch,
    worktree: next.current.worktree,
    headSha: next.current.headSha,
    previousBaseSha: next.current.baseSha,
    previousStage: next.current.stage,
    previousMergeSha: next.current.mergeSha,
    preservedReviewPasses: next.current.reviewPasses.length,
  });
  next.current.stage = "ci-review";
  next.current.repository = evidence.repository;
  next.current.deliveryBase = evidence.baseRefName;
  next.current.baseSha = evidence.liveBaseSha;
  next.current.isDraft = true;
  next.current.mergeSha = null;
  next.current.deliveryEvidence = {
    draftPr: null,
    latestOpen: evidence,
    readyToMerge: null,
    reviewed: null,
    merged: null,
    cleanup: null,
    completed: null,
    legacyRebaseline: evidence,
  };
  next.current.legacyRebaselineRequired = false;
  validateStageEvidence(next.current, next.mode);
  next.updatedAt = timestamp;
  next.lease.heartbeatAt = timestamp;
  next.lease.expiresAt = addMinutes(timestamp, next.leaseMinutes);
  return next;
}

function assertNoUntrustedDeliveryMetadata(metadata) {
  const forbidden = [
    "prNumber",
    "headSha",
    "mergeSha",
    "isDraft",
    "mergeForbidden",
    "adminReviewRequired",
    "prTitlePrefix",
    "prBodyMarker",
    "blockingLabel",
    "repository",
    "deliveryBase",
  ].filter((key) => metadata[key] !== undefined);
  if (forbidden.length > 0) {
    throw new RunStateError(
      `Leveransbevis får inte registreras som metadata (${forbidden.join(", ")}); använd färskt trustedEvidence.`,
      8,
    );
  }
}

function applyStageEvidence(current, mode, stage, trustedEvidence, now) {
  const requiresEvidence =
    stage === "draft-pr" ||
    (mode === "full" && ["ci-review", "ready-to-merge", "merged", "cleanup"].includes(stage));
  if (!requiresEvidence) {
    if (trustedEvidence !== null) {
      throw new RunStateError(`Stage ${stage} accepterar inte PR-evidence.`);
    }
    return;
  }

  const allowRevisionUpdate = stage === "draft-pr" || stage === "ci-review";
  const allowPostMergeBase = stage === "merged" || stage === "cleanup";
  const priorObservedAt = latestEvidenceObservedAt(current);
  const evidence = validateDeliveryEvidence(current, trustedEvidence, {
    now,
    allowRevisionUpdate,
    allowPostMergeBase,
    requireStrictlyNewer: stage === "cleanup",
    priorObservedAt,
  });

  if (stage === "draft-pr") {
    requirePullRequestState(evidence, { state: "OPEN", isDraft: true, stage });
    if (mode === "evaluation") {
      if (!evidence.titlePrefixPresent || !evidence.bodyMarkerPresent) {
        throw new RunStateError(
          "Evaluation draft-pr kräver verifierad adminmarkör i både titel och body.",
          8,
        );
      }
    }
    current.prNumber = evidence.prNumber;
    current.headSha = evidence.headRefOid;
    current.repository = evidence.repository;
    current.deliveryBase = evidence.baseRefName;
    current.baseSha = evidence.liveBaseSha;
    current.isDraft = true;
    if (mode === "evaluation") {
      current.mergeForbidden = true;
      current.adminReviewRequired = true;
      current.prTitlePrefix = EVALUATION_TITLE_PREFIX;
      current.prBodyMarker = EVALUATION_BODY_MARKER;
      current.blockingLabel =
        evidence.blockingLabels.find((label) =>
          ["do-not-merge", "admin-review-required"].includes(label),
        ) ?? null;
    }
    current.deliveryEvidence.draftPr ??= evidence;
    current.deliveryEvidence.latestOpen = evidence;
    return;
  }

  if (!current.deliveryEvidence.draftPr && !current.deliveryEvidence.legacyRebaseline) {
    throw new RunStateError("Leveransflödet saknar verifierat draft-pr-bevis.", 8);
  }
  if (stage === "ci-review") {
    requirePullRequestState(evidence, { state: "OPEN", stage });
    current.headSha = evidence.headRefOid;
    current.baseSha = evidence.liveBaseSha;
    current.isDraft = evidence.isDraft;
    current.deliveryEvidence.latestOpen = evidence;
    return;
  }
  if (stage === "ready-to-merge") {
    requirePullRequestState(evidence, { state: "OPEN", isDraft: false, stage });
    current.isDraft = false;
    current.deliveryEvidence.readyToMerge = evidence;
    current.deliveryEvidence.latestOpen = evidence;
    return;
  }
  if (!current.deliveryEvidence.readyToMerge) {
    throw new RunStateError("Mergeflödet saknar verifierad draft-till-ready-övergång.", 8);
  }
  if (stage === "merged") {
    requirePullRequestState(evidence, { state: "MERGED", isDraft: false, stage });
    if (!SHA_PATTERN.test(evidence.mergeCommitOid ?? "")) {
      throw new RunStateError("Merged evidence saknar exakt mergeCommit SHA.", 8);
    }
    requirePreviewContainsMerge(evidence, evidence.mergeCommitOid, "merged");
    current.mergeSha = evidence.mergeCommitOid;
    current.deliveryEvidence.merged = evidence;
    return;
  }
  if (!current.deliveryEvidence.merged) {
    throw new RunStateError("Cleanup kräver tidigare verifierat MERGED-bevis.", 8);
  }
  requirePullRequestState(evidence, { state: "MERGED", isDraft: false, stage });
  if (evidence.mergeCommitOid !== current.mergeSha) {
    throw new RunStateError("Cleanup evidence matchar inte registrerad mergeCommit SHA.", 8);
  }
  requirePreviewContainsMerge(evidence, current.mergeSha, "cleanup-ready");
  requireCleanupReadiness(current, evidence, "cleanup-ready");
  current.deliveryEvidence.cleanup = evidence;
}

function assertUniquePassEvidence(state, { branch, prNumber }) {
  if (branch && state.history.some((entry) => entry.item?.branch === branch)) {
    throw new RunStateError(`Branchen ${branch} har redan använts av ett tidigare pass.`);
  }
  if (
    Number.isInteger(prNumber) &&
    state.history.some((entry) => entry.item?.prNumber === prNumber)
  ) {
    throw new RunStateError(`PR #${prNumber} har redan använts av ett tidigare pass.`);
  }
}

function validateDeliveryEvidence(
  current,
  evidence,
  {
    now,
    allowRevisionUpdate = false,
    allowPostMergeBase = false,
    requireStrictlyNewer = false,
    priorObservedAt = null,
  },
) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new RunStateError("Stage kräver färskt trustedEvidence från GitHub API.", 8);
  }
  const requiredStrings = [
    "repository",
    "localRepository",
    "headRepository",
    "baseRefName",
    "headRefName",
    "headRefOid",
    "localBranch",
    "localHeadSha",
    "localWorktree",
    "liveBaseSha",
    "state",
    "observedAt",
  ];
  for (const key of requiredStrings) {
    if (typeof evidence[key] !== "string" || !evidence[key].trim()) {
      throw new RunStateError(`PR-evidence saknar ${key}.`, 8);
    }
  }
  if (!Number.isInteger(evidence.prNumber) || evidence.prNumber < 1) {
    throw new RunStateError("PR-evidence saknar positivt PR-nummer.", 8);
  }
  if (!REPOSITORY_PATTERN.test(evidence.repository)) {
    throw new RunStateError("PR-evidence har ogiltig repository-identitet.", 8);
  }
  if (
    evidence.repository !== evidence.localRepository ||
    evidence.repository !== evidence.headRepository
  ) {
    throw new RunStateError("PR-evidence matchar inte lokal/base/head-repository.", 8);
  }
  if (evidence.baseRefName !== DELIVERY_BASE) {
    throw new RunStateError(`Godnatt-leverans kräver base ${DELIVERY_BASE}.`, 8);
  }
  if (current.deliveryBase !== null && current.deliveryBase !== evidence.baseRefName) {
    throw new RunStateError("PR base är immutable efter första verifieringen.", 8);
  }
  if (current.repository !== null && current.repository !== evidence.repository) {
    throw new RunStateError("PR repository är immutable efter första verifieringen.", 8);
  }
  if (current.prNumber !== null && current.prNumber !== evidence.prNumber) {
    throw new RunStateError("PR-nummer är immutable efter första verifieringen.", 8);
  }
  if (
    current.worktree &&
    normalizeFsPath(current.worktree) !== normalizeFsPath(evidence.localWorktree)
  ) {
    throw new RunStateError("PR-evidence kommer inte från registrerad immutable app-worktree.", 8);
  }
  if (
    evidence.headRefName !== current.branch ||
    evidence.localBranch !== current.branch ||
    evidence.headRefName !== evidence.localBranch
  ) {
    throw new RunStateError("PR head måste vara exakt aktuell registrerad branch.", 8);
  }
  if (
    !SHA_PATTERN.test(evidence.headRefOid) ||
    !SHA_PATTERN.test(evidence.localHeadSha) ||
    evidence.headRefOid !== evidence.localHeadSha
  ) {
    throw new RunStateError("PR head-SHA måste vara exakt lokal aktuell HEAD.", 8);
  }
  if (!allowRevisionUpdate && current.headSha !== null && current.headSha !== evidence.headRefOid) {
    throw new RunStateError("PR head-SHA har ändrats efter den SHA-bundna grinden.", 8);
  }
  if (!SHA_PATTERN.test(evidence.liveBaseSha)) {
    throw new RunStateError("PR-evidence saknar live preview base-SHA.", 8);
  }
  if (
    !allowRevisionUpdate &&
    !allowPostMergeBase &&
    current.baseSha !== null &&
    current.baseSha !== evidence.liveBaseSha
  ) {
    throw new RunStateError("Live preview base-SHA har ändrats efter reviewgrinden.", 8);
  }
  if (typeof evidence.isDraft !== "boolean") {
    throw new RunStateError("PR-evidence saknar isDraft boolean.", 8);
  }
  if (!Array.isArray(evidence.blockingLabels) || !evidence.blockingLabels.every(isString)) {
    throw new RunStateError("PR-evidence har ogiltiga labels.", 8);
  }
  for (const key of ["titlePrefixPresent", "bodyMarkerPresent"]) {
    if (typeof evidence[key] !== "boolean") {
      throw new RunStateError(`PR-evidence saknar ${key} boolean.`, 8);
    }
  }

  const observedMs = Date.parse(evidence.observedAt);
  const nowMs = Date.parse(toIso(now));
  if (!Number.isFinite(observedMs))
    throw new RunStateError("PR-evidence har ogiltig observedAt.", 8);
  if (observedMs < nowMs - MAX_EVIDENCE_AGE_MS) {
    throw new RunStateError("PR-evidence är stale; hämta ett nytt GitHub API-svar.", 8);
  }
  if (observedMs > nowMs + MAX_EVIDENCE_FUTURE_SKEW_MS) {
    throw new RunStateError("PR-evidence har observedAt orimligt långt i framtiden.", 8);
  }
  if (priorObservedAt) {
    const priorMs = Date.parse(priorObservedAt);
    if (observedMs < priorMs || (requireStrictlyNewer && observedMs <= priorMs)) {
      throw new RunStateError("PR-evidence är inte nyare än föregående leveransbevis.", 8);
    }
  }

  return {
    provider: "gh-api",
    repository: evidence.repository,
    localRepository: evidence.localRepository,
    headRepository: evidence.headRepository,
    prNumber: evidence.prNumber,
    state: evidence.state,
    isDraft: evidence.isDraft,
    baseRefName: evidence.baseRefName,
    headRefName: evidence.headRefName,
    headRefOid: evidence.headRefOid,
    localBranch: evidence.localBranch,
    localHeadSha: evidence.localHeadSha,
    localWorktree: resolve(evidence.localWorktree),
    liveBaseSha: evidence.liveBaseSha,
    mergeCommitOid: evidence.mergeCommitOid ?? null,
    mergedAt: evidence.mergedAt ?? null,
    titlePrefixPresent: evidence.titlePrefixPresent,
    bodyMarkerPresent: evidence.bodyMarkerPresent,
    blockingLabels: [...evidence.blockingLabels],
    remoteBranchRef: evidence.remoteBranchRef ?? null,
    remoteBranchAbsent: evidence.remoteBranchAbsent ?? null,
    worktreeClean: evidence.worktreeClean ?? null,
    previewAncestryStatus: evidence.previewAncestryStatus ?? null,
    previewMergeBaseSha: evidence.previewMergeBaseSha ?? null,
    observedAt: new Date(observedMs).toISOString(),
  };
}

function requirePullRequestState(evidence, { state, isDraft, stage }) {
  if (evidence.state !== state) {
    throw new RunStateError(`${stage} kräver GitHub PR state ${state}.`, 8);
  }
  if (isDraft !== undefined && evidence.isDraft !== isDraft) {
    throw new RunStateError(`${stage} kräver isDraft=${isDraft}.`, 8);
  }
  if (state === "MERGED") {
    if (!evidence.mergedAt || !SHA_PATTERN.test(evidence.mergeCommitOid ?? "")) {
      throw new RunStateError(`${stage} kräver MERGED med mergedAt och mergeCommit SHA.`, 8);
    }
  } else if (evidence.mergedAt !== null || evidence.mergeCommitOid !== null) {
    throw new RunStateError(`${stage} kräver en omergad PR.`, 8);
  }
}

function requireCleanupReadiness(current, evidence, stage) {
  const expectedRef = `refs/heads/${current.branch}`;
  if (evidence.remoteBranchRef !== expectedRef || evidence.remoteBranchAbsent !== true) {
    throw new RunStateError(
      `${stage} kräver verifierat absent remote pass-branch ${expectedRef}; fel/okänt svar är stopp.`,
      8,
    );
  }
  if (evidence.worktreeClean !== true) {
    throw new RunStateError(`${stage} kräver ren registrerad app-worktree.`, 8);
  }
  if (evidence.localHeadSha !== current.headSha) {
    throw new RunStateError(`${stage} kräver app-worktree på exakt registrerad head-SHA.`, 8);
  }
}

function requirePreviewContainsMerge(evidence, mergeSha, stage) {
  if (!SHA_PATTERN.test(mergeSha ?? "")) {
    throw new RunStateError(`${stage} saknar registrerad mergeCommit SHA.`, 8);
  }
  if (evidence.liveBaseSha === mergeSha) return;
  if (evidence.previewAncestryStatus !== "ahead" || evidence.previewMergeBaseSha !== mergeSha) {
    throw new RunStateError(
      `${stage} kräver bevis att registrerad mergeCommit fortfarande är ancestor till live preview-tip; rewound/diverged/okänt är stopp.`,
      8,
    );
  }
}

function latestEvidenceObservedAt(current) {
  const evidence = current.deliveryEvidence ?? {};
  const timestamps = [
    evidence.completed,
    evidence.cleanup,
    evidence.merged,
    evidence.reviewed,
    evidence.readyToMerge,
    evidence.latestOpen,
    evidence.draftPr,
    evidence.legacyRebaseline,
  ]
    .map((item) => item?.observedAt)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return timestamps[0] ?? null;
}

function isString(value) {
  return typeof value === "string";
}

export function heartbeatLease(state, { token, now }) {
  const next = normalizeState(state);
  assertLease(next, token, now);
  next.lease.heartbeatAt = toIso(now);
  next.lease.expiresAt = addMinutes(next.lease.heartbeatAt, next.leaseMinutes);
  next.updatedAt = toIso(now);
  return next;
}

export function recordReviewPass(
  state,
  {
    token,
    source,
    verdict,
    reviewedSha,
    reviewedBaseSha,
    note,
    now,
    sourceMetadata = null,
    trustedEvidence = null,
  },
) {
  const next = normalizeState(state);
  assertLease(next, token, now);
  if (!next.current) throw new RunStateError("Ingen kandidat är claimad.");
  const stageIndex = STAGES.indexOf(next.current.stage);
  if (stageIndex < STAGES.indexOf("draft-pr") || stageIndex > STAGES.indexOf("ready-to-merge")) {
    throw new RunStateError("PR-review får bara registreras mellan draft-pr och ready-to-merge.");
  }
  if (RETIRED_REVIEW_SOURCES.has(source)) {
    throw new RunStateError(
      `Reviewkällan ${source} är pensionerad för nya pass; historiska poster förblir läsbara.`,
      8,
    );
  }
  if (!REVIEW_SOURCES.has(source)) throw new RunStateError(`Okänd reviewkälla: ${source}`);
  if (!REVIEW_VERDICTS.has(verdict)) throw new RunStateError(`Okänd reviewverdict: ${verdict}`);
  if (next.current.reviewPasses.length >= 3) {
    throw new RunStateError("Högst tre PR-reviewpass är tillåtna; pausa för ägartriage.", 8);
  }
  const evidence = validateDeliveryEvidence(next.current, trustedEvidence, {
    now,
    allowRevisionUpdate: false,
    priorObservedAt: latestEvidenceObservedAt(next.current),
  });
  requirePullRequestState(evidence, {
    state: "OPEN",
    ...(next.mode === "evaluation" || next.mode === "pilot" ? { isDraft: true } : {}),
    stage: "review",
  });
  if (
    !SHA_PATTERN.test(reviewedSha ?? "") ||
    reviewedSha !== next.current.headSha ||
    reviewedSha !== evidence.headRefOid
  ) {
    throw new RunStateError(
      "--reviewed-sha måste vara exakt den SHA som granskades och matcha live current/head.",
      8,
    );
  }
  if (
    !SHA_PATTERN.test(reviewedBaseSha ?? "") ||
    reviewedBaseSha !== next.current.baseSha ||
    reviewedBaseSha !== evidence.liveBaseSha
  ) {
    throw new RunStateError(
      "--reviewed-base-sha måste vara exakt live preview-SHA som granskades.",
      8,
    );
  }
  const normalizedSourceMetadata = normalizeReviewSourceMetadata(source, sourceMetadata);
  const timestamp = toIso(now);
  next.current.reviewPasses.push({
    at: timestamp,
    source,
    verdict,
    sha: evidence.headRefOid,
    baseSha: evidence.liveBaseSha,
    note: note?.trim() || null,
    sourceMetadata: normalizedSourceMetadata,
    evidence,
  });
  next.current.deliveryEvidence.reviewed = evidence;
  next.current.deliveryEvidence.latestOpen = evidence;
  next.updatedAt = timestamp;
  next.lease.heartbeatAt = timestamp;
  next.lease.expiresAt = addMinutes(timestamp, next.leaseMinutes);
  return next;
}

export function completePass(state, { token, outcome, evidence, now, trustedEvidence = null }) {
  const next = normalizeState(state);
  assertLease(next, token, now);
  if (!evidence?.trim()) throw new RunStateError("complete kräver --evidence.");
  if (!next.current) throw new RunStateError("Ingen kandidat är claimad.");
  if (next.mode === "pilot") {
    throw new RunStateError(
      "Pilot får inte räknas som terminalt; pausa vid draft-PR eller promovera med ägarmandat.",
      8,
    );
  }
  if (next.mode === "full") {
    if (!FULL_OUTCOMES.has(outcome)) throw new RunStateError(`Okänt full-outcome: ${outcome}`);
    if (next.current.stage !== "cleanup") {
      throw new RunStateError(
        `Passet får räknas först efter merge och cleanup; nuvarande stage är ${next.current.stage}.`,
      );
    }
    validateStageEvidence(next.current, next.mode);
    applyCompletionEvidence(next.current, "full", trustedEvidence, now);
  } else if (next.mode === "evaluation") {
    if (!EVALUATION_OUTCOMES.has(outcome)) {
      throw new RunStateError(`Okänt evaluation-outcome: ${outcome}`);
    }
    if (next.current.stage !== "draft-pr") {
      throw new RunStateError(
        `Evaluation-pass får räknas först vid säkrad draft-pr; nuvarande stage är ${next.current.stage}.`,
      );
    }
    validateStageEvidence(next.current, next.mode);
    if (!hasAcceptedCurrentReview(next.current)) {
      throw new RunStateError(
        "Evaluation-pass kräver en godkänd review för exakt aktuell head- och base-SHA.",
      );
    }
    if (next.current.mergeSha !== null) {
      throw new RunStateError("Evaluation-pass får aldrig bära merge-SHA.", 8);
    }
    applyCompletionEvidence(next.current, "evaluation", trustedEvidence, now);
  }

  const timestamp = toIso(now);
  next.history.push({
    kind: next.mode === "evaluation" ? "evaluation-draft-completed" : "pass-completed",
    at: timestamp,
    outcome,
    evidence: evidence.trim(),
    item: next.current,
  });
  next.completedPasses += 1;
  if (next.mode === "evaluation") next.draftPasses += 1;
  else next.mergedPasses += 1;
  next.remainingPasses -= 1;
  next.current = null;
  next.lease = null;
  next.pauseReason = null;
  if (next.remainingPasses === 0) {
    next.status = "completed";
    next.notBefore = null;
  } else {
    next.status = "cooldown";
    next.notBefore = addMinutes(timestamp, next.cooldownMinutes);
  }
  next.updatedAt = timestamp;
  return next;
}

function normalizeReviewSourceMetadata(source, sourceMetadata) {
  if (
    sourceMetadata !== null &&
    (typeof sourceMetadata !== "object" || Array.isArray(sourceMetadata))
  ) {
    throw new RunStateError("Reviewmetadata måste vara ett objekt.");
  }
  const raw = sourceMetadata ?? {};
  const allowedKeys = new Set(["model", "reviewer", "url", "externalId", "procedure"]);
  const unknown = Object.keys(raw).filter((key) => !allowedKeys.has(key));
  if (unknown.length > 0) {
    throw new RunStateError(`Okända reviewmetadatafält: ${unknown.join(", ")}`);
  }
  const normalized = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string" || !value.trim()) {
      throw new RunStateError(`Reviewmetadata ${key} måste vara en icke-tom sträng.`);
    }
    normalized[key] = value.trim();
  }
  if (normalized.url !== undefined && !/^https:\/\//iu.test(normalized.url)) {
    throw new RunStateError("Reviewmetadata url måste vara en https-URL.");
  }
  if (source === "independent-agent") {
    if (normalized.model !== INDEPENDENT_REVIEW_MODEL) {
      throw new RunStateError(`independent-agent kräver model=${INDEPENDENT_REVIEW_MODEL}.`, 8);
    }
    if (
      normalized.procedure !== undefined &&
      normalized.procedure !== INDEPENDENT_REVIEW_PROCEDURE
    ) {
      throw new RunStateError(
        `independent-agent-proceduren måste heta ${INDEPENDENT_REVIEW_PROCEDURE}.`,
        8,
      );
    }
    normalized.procedure = INDEPENDENT_REVIEW_PROCEDURE;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function applyCompletionEvidence(current, mode, trustedEvidence, now) {
  const evidence = validateDeliveryEvidence(current, trustedEvidence, {
    now,
    allowRevisionUpdate: false,
    allowPostMergeBase: mode === "full",
    requireStrictlyNewer: true,
    priorObservedAt: latestEvidenceObservedAt(current),
  });
  if (mode === "evaluation") {
    requirePullRequestState(evidence, {
      state: "OPEN",
      isDraft: true,
      stage: "evaluation-complete",
    });
    if (!hasAcceptedCurrentReview(current) || evidence.headRefOid !== current.headSha) {
      throw new RunStateError(
        "Evaluation-complete kräver färskt draft-bevis för exakt reviewad head-SHA.",
        8,
      );
    }
    if (!evidence.titlePrefixPresent || !evidence.bodyMarkerPresent) {
      throw new RunStateError(
        "Evaluation-complete kräver färskt bevis för titel- och body-adminmarkörerna.",
        8,
      );
    }
  } else {
    requirePullRequestState(evidence, {
      state: "MERGED",
      isDraft: false,
      stage: "full-complete",
    });
    if (!current.deliveryEvidence.cleanup) {
      throw new RunStateError("Full-complete kräver färskt cleanup-bevis.", 8);
    }
    if (evidence.mergeCommitOid !== current.mergeSha) {
      throw new RunStateError("Full-complete matchar inte registrerad mergeCommit SHA.", 8);
    }
    requirePreviewContainsMerge(evidence, current.mergeSha, "full-complete");
    requireCleanupReadiness(current, evidence, "full-complete cleanup-ready");
  }
  current.deliveryEvidence.completed = evidence;
}

export function skipCandidate(state, { token, reason, now }) {
  const next = normalizeState(state);
  assertLease(next, token, now);
  if (!reason?.trim()) throw new RunStateError("skip kräver --reason.");
  if (!next.current) throw new RunStateError("Ingen kandidat är claimad.");
  if (STAGES.indexOf(next.current.stage) >= STAGES.indexOf("worktree-ready")) {
    throw new RunStateError(
      "skip är förbjudet efter worktree-ready; pausa och bevara branch/PR för handoff.",
      8,
    );
  }
  const timestamp = toIso(now);
  next.history.push({
    kind: "candidate-skipped",
    at: timestamp,
    reason: reason.trim(),
    item: next.current,
  });
  next.current = null;
  next.lease = null;
  next.status = "cooldown";
  next.notBefore = addMinutes(timestamp, next.cooldownMinutes);
  next.updatedAt = timestamp;
  return next;
}

export function pauseRun(state, { token, reason, now }) {
  const next = normalizeState(state);
  assertLease(next, token, now);
  if (!reason?.trim()) throw new RunStateError("pause kräver --reason.");
  next.status = "paused";
  next.pauseReason = reason.trim();
  next.lease = null;
  next.updatedAt = toIso(now);
  return next;
}

export function resumeRun(state, { runId, reason, now }) {
  const next = normalizeState(state);
  assertRunId(next, runId);
  if (next.status !== "paused") throw new RunStateError("Bara en pausad run kan återupptas.");
  if (!reason?.trim()) throw new RunStateError("resume kräver --reason.");
  const timestamp = toIso(now);
  next.history.push({ kind: "run-resumed", at: timestamp, reason: reason.trim() });
  next.status = "ready";
  next.pauseReason = null;
  next.notBefore = null;
  next.updatedAt = timestamp;
  return next;
}

export function promoteRun(
  state,
  { runId, authorization, reason, now, trustedRolloutEvidence = null },
) {
  const next = normalizeState(state);
  assertRunId(next, runId);
  if (next.status !== "paused") throw new RunStateError("Bara en pausad run kan promoveras.");
  if (next.mode !== "pilot") {
    throw new RunStateError("Bara en pilot-run kan promoveras till full mode.", 8);
  }
  if (!authorization?.trim() || !next.promotionAuthorizationHash) {
    throw new RunStateError("promote kräver pilotens privata --authorization capability.", 8);
  }
  const expected = Buffer.from(next.promotionAuthorizationHash, "hex");
  const actual = Buffer.from(
    createHash("sha256").update(authorization.trim()).digest("hex"),
    "hex",
  );
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new RunStateError("Ogiltig promotion capability.", 8);
  }
  if (!reason?.trim()) throw new RunStateError("promote kräver --reason.");
  const rolloutEvidence = validateFullRolloutEvidence(trustedRolloutEvidence, now);
  const timestamp = toIso(now);
  next.history.push({
    kind: "run-promoted",
    at: timestamp,
    fromMode: next.mode,
    toMode: "full",
    reason: reason.trim(),
  });
  next.mode = "full";
  next.fullRolloutEvidence = rolloutEvidence;
  next.promotionAuthorizationHash = null;
  next.status = "ready";
  next.pauseReason = null;
  next.notBefore = null;
  next.updatedAt = timestamp;
  return next;
}

export function releaseLease(state, { token, reason, now }) {
  const next = normalizeState(state);
  assertLease(next, token, now);
  if (!reason?.trim()) throw new RunStateError("release kräver --reason.");
  const timestamp = toIso(now);
  next.history.push({ kind: "lease-released", at: timestamp, reason: reason.trim() });
  next.lease = null;
  next.status = "ready";
  next.updatedAt = timestamp;
  return next;
}

function hasAcceptedCurrentReview(current) {
  for (let index = current.reviewPasses.length - 1; index >= 0; index -= 1) {
    const review = current.reviewPasses[index];
    if (review.sha !== current.headSha || review.baseSha !== current.baseSha) continue;
    return review.verdict === "clean" || review.verdict === "findings-fixed";
  }
  return false;
}

function validateStageEvidence(current, mode) {
  const stageIndex = STAGES.indexOf(current.stage);
  if (current.legacyRebaselineRequired === true && stageIndex >= STAGES.indexOf("ci-review")) {
    throw new RunStateError(
      "Legacy-state saknar base-bundet bevis; kör explicit rebaseline-legacy.",
      8,
    );
  }
  if (stageIndex >= STAGES.indexOf("worktree-ready")) {
    if (!BRANCH_PATTERN.test(current.branch ?? "")) {
      throw new RunStateError("worktree-ready kräver en fix/feat/docs/chore pass-branch.");
    }
    if (!current.worktree || !isAbsolute(current.worktree)) {
      throw new RunStateError("worktree-ready kräver en absolut pass-worktree-path.");
    }
  }
  if (stageIndex >= STAGES.indexOf("draft-pr")) {
    if (!Number.isInteger(current.prNumber) || current.prNumber < 1) {
      throw new RunStateError("draft-pr kräver ett positivt PR-nummer.");
    }
    if (!SHA_PATTERN.test(current.headSha ?? "")) {
      throw new RunStateError("draft-pr kräver en exakt 40-teckens head-SHA.");
    }
    if (!SHA_PATTERN.test(current.baseSha ?? "")) {
      throw new RunStateError("draft-pr kräver live preview base-SHA.", 8);
    }
    if (!current.deliveryEvidence?.draftPr && !current.deliveryEvidence?.legacyRebaseline) {
      throw new RunStateError("draft-pr kräver färskt GitHub API-bevis.", 8);
    }
    if (!current.repository || current.deliveryBase !== DELIVERY_BASE) {
      throw new RunStateError(`draft-pr kräver repository-bindning och base ${DELIVERY_BASE}.`, 8);
    }
    if (
      (mode === "pilot" || stageIndex === STAGES.indexOf("draft-pr")) &&
      current.isDraft !== true
    ) {
      throw new RunStateError("draft-pr kräver verifierat is-draft=true.", 8);
    }
    if (mode === "evaluation") {
      if (
        current.isDraft !== true ||
        current.mergeForbidden !== true ||
        current.adminReviewRequired !== true
      ) {
        throw new RunStateError(
          "Evaluation draft-pr kräver is-draft, merge-forbidden och admin-review-required.",
          8,
        );
      }
      if (current.prTitlePrefix !== EVALUATION_TITLE_PREFIX) {
        throw new RunStateError(`Evaluation-PR kräver title-prefix: ${EVALUATION_TITLE_PREFIX}`, 8);
      }
      if (current.prBodyMarker !== EVALUATION_BODY_MARKER) {
        throw new RunStateError(`Evaluation-PR kräver body-marker: ${EVALUATION_BODY_MARKER}`, 8);
      }
    }
  }
  if (stageIndex >= STAGES.indexOf("ready-to-merge")) {
    if (!hasAcceptedCurrentReview(current)) {
      throw new RunStateError(
        "ready-to-merge kräver en godkänd review för exakt aktuell head- och base-SHA.",
      );
    }
    if (!current.deliveryEvidence?.readyToMerge || current.isDraft !== false) {
      throw new RunStateError("ready-to-merge kräver verifierad draft-till-ready-övergång.", 8);
    }
  }
  if (stageIndex >= STAGES.indexOf("merged")) {
    if (!SHA_PATTERN.test(current.mergeSha ?? "") || !current.deliveryEvidence?.merged) {
      throw new RunStateError("merged kräver verifierat MERGED-bevis och exakt mergeCommit SHA.");
    }
  }
  if (stageIndex >= STAGES.indexOf("cleanup")) {
    if (!current.deliveryEvidence?.cleanup) {
      throw new RunStateError("cleanup kräver ett nytt verifierat MERGED-bevis.", 8);
    }
    requireCleanupReadiness(current, current.deliveryEvidence.cleanup, "cleanup-ready");
  }
}

export function assertWorktreeBinding(state, cwd) {
  if (!state.current) return;
  if (STAGES.indexOf(state.current.stage) < STAGES.indexOf("worktree-ready")) return;
  const expected = normalizeFsPath(state.current.worktree);
  const actual = normalizeFsPath(cwd);
  if (expected !== actual) {
    throw new RunStateError(
      "Aktiv run är bunden till ett annat app-worktree; återuppta originaltasken.",
      9,
      { expectedWorktree: state.current.worktree, actualWorktree: resolve(cwd) },
    );
  }
}

export function normalizeFsPath(path, platform = process.platform) {
  const normalized = resolve(path).replace(/[\\/]+$/u, "");
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function assertRunnableState(state) {
  if (state.status === "paused")
    throw new RunStateError("Batchen är pausad.", 7, { reason: state.pauseReason });
  if (state.status === "completed") throw new RunStateError("Batchen är redan klar.", 7);
}

function assertRunId(state, runId) {
  if (state.runId !== runId) throw new RunStateError("run-id matchar inte aktiv run.");
}

function assertLease(state, token, now) {
  const tokenHash = typeof token === "string" && token ? hashToken(token) : null;
  const expectedHash = state.lease?.tokenHash;
  if (
    !state.lease ||
    state.lease.credentialConflict === true ||
    !TOKEN_HASH_PATTERN.test(expectedHash ?? "") ||
    !tokenHash ||
    !timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(tokenHash, "hex"))
  ) {
    throw new RunStateError("Ogiltig eller saknad runner-token.", 3);
  }
  if (Date.parse(state.lease.expiresAt) <= Date.parse(toIso(now))) {
    throw new RunStateError("Runner-token har gått ut; använd recover efter säker kontroll.", 6, {
      expiredAt: state.lease.expiresAt,
    });
  }
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function validateFullRolloutEvidence(evidence, now) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new RunStateError(
      "Full mode är spärrat tills canonical preview-policy kan verifieras live.",
      8,
    );
  }
  if (
    !REPOSITORY_PATTERN.test(evidence.repository ?? "") ||
    evidence.repository !== evidence.localRepository
  ) {
    throw new RunStateError("Rollout-evidence matchar inte lokal repository.", 8);
  }
  if (
    evidence.refName !== DELIVERY_BASE ||
    !SHA_PATTERN.test(evidence.refSha ?? "") ||
    evidence.policyPath !== WORKFLOW_POLICY_PATH ||
    !SHA_PATTERN.test(evidence.policyBlobSha ?? "")
  ) {
    throw new RunStateError("Rollout-evidence saknar canonical preview ref/policy-bindning.", 8);
  }
  if (evidence.deliveryBranch !== DELIVERY_BASE) {
    throw new RunStateError(
      `Canonical preview-policy måste ange deliveryBranch=${DELIVERY_BASE} innan full mode.`,
      8,
    );
  }
  assertFreshObservedAt(evidence.observedAt, now, "Rollout-evidence");
  return {
    provider: "gh-api-graphql",
    repository: evidence.repository,
    localRepository: evidence.localRepository,
    refName: evidence.refName,
    refSha: evidence.refSha,
    policyPath: evidence.policyPath,
    policyBlobSha: evidence.policyBlobSha,
    deliveryBranch: evidence.deliveryBranch,
    observedAt: new Date(Date.parse(evidence.observedAt)).toISOString(),
  };
}

function assertFreshObservedAt(observedAt, now, label) {
  const observedMs = Date.parse(observedAt);
  const nowMs = Date.parse(toIso(now));
  if (!Number.isFinite(observedMs)) {
    throw new RunStateError(`${label} har ogiltig observedAt.`, 8);
  }
  if (observedMs < nowMs - MAX_EVIDENCE_AGE_MS) {
    throw new RunStateError(`${label} är stale; hämta nytt read-only GitHub-bevis.`, 8);
  }
  if (observedMs > nowMs + MAX_EVIDENCE_FUTURE_SKEW_MS) {
    throw new RunStateError(`${label} har observedAt orimligt långt i framtiden.`, 8);
  }
  return observedMs;
}

function clone(value) {
  return structuredClone(value);
}

function normalizeState(value) {
  const next = clone(value);
  const sourceVersion = next.version;
  if (sourceVersion !== STATE_VERSION && !LEGACY_STATE_VERSIONS.has(sourceVersion)) {
    throw new RunStateError(`Okänd state-version: ${next.version}`);
  }
  next.version = STATE_VERSION;
  next.fullRolloutEvidence ??= null;
  normalizeLeaseRecord(next.lease, { active: true });
  if (!Array.isArray(next.history)) next.history = [];
  for (const entry of next.history) {
    normalizeLeaseRecord(entry?.previousLease, { active: false });
  }
  if (next.current) {
    next.current.repository ??= null;
    next.current.deliveryBase ??= null;
    next.current.baseSha ??= null;
    if (LEGACY_STATE_VERSIONS.has(sourceVersion)) {
      next.current.legacySourceVersion = sourceVersion;
      next.current.legacyRebaselineRequired =
        STAGES.indexOf(next.current.stage) >= STAGES.indexOf("ci-review");
    } else {
      next.current.legacySourceVersion ??= null;
      next.current.legacyRebaselineRequired ??= false;
    }
    next.current.deliveryEvidence = {
      draftPr: null,
      latestOpen: null,
      readyToMerge: null,
      reviewed: null,
      merged: null,
      cleanup: null,
      completed: null,
      legacyRebaseline: null,
      ...(next.current.deliveryEvidence ?? {}),
    };
    if (!Array.isArray(next.current.reviewPasses)) next.current.reviewPasses = [];
  }
  return next;
}

function normalizeLeaseRecord(lease, { active }) {
  if (!lease || typeof lease !== "object") return;
  if (typeof lease.token === "string" && lease.token) {
    const convertedHash = hashToken(lease.token);
    if (
      typeof lease.tokenHash === "string" &&
      lease.tokenHash &&
      lease.tokenHash !== convertedHash
    ) {
      lease.credentialConflict = true;
    } else {
      lease.tokenHash = convertedHash;
    }
    delete lease.token;
  }
  if (!TOKEN_HASH_PATTERN.test(lease.tokenHash ?? "")) {
    if (active) lease.credentialConflict = true;
    else lease.tokenHash = null;
  }
}

function toIso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RunStateError(`Ogiltig tid: ${value}`);
  return date.toISOString();
}

function addMinutes(iso, minutes) {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) throw new RunStateError(`Oväntat argument: ${item}`);
    const key = item.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new RunStateError(`Saknat värde för --${key}.`);
    flags[key] = value;
    index += 1;
  }
  return { command, flags };
}

function resolveStateDir(cwd = process.cwd()) {
  if (process.env.GODNATT_BUGG_STATE_DIR) return resolve(process.env.GODNATT_BUGG_STATE_DIR);
  const raw = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
  const commonDir = isAbsolute(raw) ? raw : resolve(cwd, raw);
  return join(commonDir, "codex", "godnatt-bugg");
}

function paths(cwd = process.cwd()) {
  const dir = resolveStateDir(cwd);
  return {
    dir,
    state: join(dir, "state.json"),
    mutex: join(dir, ".mutex"),
    runs: join(dir, "runs"),
  };
}

function readState(statePath, { persistMigration = false } = {}) {
  if (!existsSync(statePath)) throw new RunStateError("Ingen godnatt-bugg-run finns.", 4);
  const rawState = JSON.parse(readFileSync(statePath, "utf8"));
  const state = normalizeState(rawState);
  if (persistMigration && JSON.stringify(rawState) !== JSON.stringify(state)) {
    atomicWrite(statePath, state);
  }
  return state;
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, path);
}

function withMutex(mutexPath, fn) {
  mkdirSync(dirname(mutexPath), { recursive: true });
  let fd;
  try {
    fd = openSync(mutexPath, "wx");
  } catch (error) {
    if (error.code === "EEXIST")
      throw new RunStateError(
        "Stateverktygets ägarlås finns redan och tas aldrig över automatiskt; inspektera ägare/process innan manuell åtgärd.",
        3,
        { mutexPath },
      );
    throw error;
  }
  try {
    writeFileSync(
      fd,
      `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
      "utf8",
    );
    return fn();
  } finally {
    closeSync(fd);
    rmSync(mutexPath, { force: true });
  }
}

function readCandidates(flags) {
  const backlogPath = resolve(flags.backlog ?? DEFAULT_BACKLOG);
  return { backlogPath, candidates: parseActiveQueue(readFileSync(backlogPath, "utf8")) };
}

function numberFlag(flags, name, fallback) {
  if (flags[name] === undefined) return fallback;
  const value = Number(flags[name]);
  if (!Number.isFinite(value)) throw new RunStateError(`--${name} måste vara ett tal.`);
  return value;
}

export function readLivePullRequestEvidence({
  prNumber,
  cwd = process.cwd(),
  execFile = execFileSync,
  includeCleanup = false,
}) {
  if (!Number.isInteger(prNumber) || prNumber < 1) {
    throw new RunStateError("Live PR-evidence kräver ett positivt PR-nummer.");
  }
  const localBranch = execFile("git", ["branch", "--show-current"], {
    cwd,
    encoding: "utf8",
    timeout: GIT_EVIDENCE_TIMEOUT_MS,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
  const localHeadSha = execFile("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    timeout: GIT_EVIDENCE_TIMEOUT_MS,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
  const originUrl = execFile("git", ["remote", "get-url", "origin"], {
    cwd,
    encoding: "utf8",
    timeout: GIT_EVIDENCE_TIMEOUT_MS,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
  const localRepository = repositoryFromRemoteUrl(originUrl);
  const response = execFile(
    "gh",
    ["api", `repos/{owner}/{repo}/pulls/${prNumber}`, "--method", "GET"],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: GH_EVIDENCE_TIMEOUT_MS,
    },
  );
  let pull;
  try {
    pull = JSON.parse(response);
  } catch {
    throw new RunStateError("GitHub API returnerade ogiltig JSON för PR-evidence.", 8);
  }
  const repository = pull?.base?.repo?.full_name;
  const headRepository = pull?.head?.repo?.full_name;
  const mergedAt = typeof pull?.merged_at === "string" ? pull.merged_at : null;
  const state = mergedAt ? "MERGED" : pull?.state === "open" ? "OPEN" : "CLOSED";
  const labels = Array.isArray(pull?.labels)
    ? pull.labels.map((label) => label?.name).filter(isString)
    : [];
  const preview = readLivePreviewRefEvidence({ cwd, execFile, localRepository });
  const mergeCommitOid = mergedAt ? (pull?.merge_commit_sha ?? null) : null;
  let previewAncestryStatus = null;
  let previewMergeBaseSha = null;
  if (
    SHA_PATTERN.test(mergeCommitOid ?? "") &&
    SHA_PATTERN.test(preview.refSha ?? "") &&
    mergeCommitOid !== preview.refSha
  ) {
    const compareResponse = execFile(
      "gh",
      [
        "api",
        `repos/{owner}/{repo}/compare/${mergeCommitOid}...${preview.refSha}`,
        "--method",
        "GET",
      ],
      {
        cwd,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        timeout: GH_EVIDENCE_TIMEOUT_MS,
      },
    );
    let compare;
    try {
      compare = JSON.parse(compareResponse);
    } catch {
      throw new RunStateError("GitHub API returnerade ogiltig JSON för preview ancestry.", 8);
    }
    previewAncestryStatus = compare?.status ?? null;
    previewMergeBaseSha = compare?.merge_base_commit?.sha ?? null;
  }
  const remoteBranchRef = `refs/heads/${pull?.head?.ref ?? ""}`;
  let remoteBranchAbsent = null;
  let worktreeClean = null;
  if (includeCleanup) {
    const remoteBranchResult = execFile(
      "git",
      ["ls-remote", "--heads", "origin", remoteBranchRef],
      {
        cwd,
        encoding: "utf8",
        timeout: GIT_EVIDENCE_TIMEOUT_MS,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      },
    );
    remoteBranchAbsent = remoteBranchResult.trim() === "";
    const status = execFile("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd,
      encoding: "utf8",
      timeout: GIT_EVIDENCE_TIMEOUT_MS,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    worktreeClean = status.trim() === "";
  }
  return {
    provider: "gh-api",
    repository,
    localRepository,
    headRepository,
    prNumber: pull?.number,
    state,
    isDraft: pull?.draft,
    baseRefName: pull?.base?.ref,
    headRefName: pull?.head?.ref,
    headRefOid: pull?.head?.sha,
    localBranch,
    localHeadSha,
    localWorktree: resolve(cwd),
    liveBaseSha: preview.refSha,
    mergeCommitOid,
    mergedAt,
    titlePrefixPresent:
      typeof pull?.title === "string" && pull.title.startsWith(EVALUATION_TITLE_PREFIX),
    bodyMarkerPresent: typeof pull?.body === "string" && pull.body.includes(EVALUATION_BODY_MARKER),
    blockingLabels: labels.filter((label) =>
      ["do-not-merge", "admin-review-required"].includes(label),
    ),
    remoteBranchRef,
    remoteBranchAbsent,
    worktreeClean,
    previewAncestryStatus,
    previewMergeBaseSha,
    observedAt: new Date().toISOString(),
  };
}

function readLivePreviewRefEvidence({
  cwd = process.cwd(),
  execFile = execFileSync,
  localRepository: providedLocalRepository = null,
} = {}) {
  const localRepository =
    providedLocalRepository ??
    repositoryFromRemoteUrl(
      execFile("git", ["remote", "get-url", "origin"], {
        cwd,
        encoding: "utf8",
        timeout: GIT_EVIDENCE_TIMEOUT_MS,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      }).trim(),
    );
  const query = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){nameWithOwner preview:ref(qualifiedName:"refs/heads/${DELIVERY_BASE}"){target{oid}}}}`;
  const response = execFile(
    "gh",
    ["api", "graphql", "-F", "owner={owner}", "-F", "name={repo}", "-f", `query=${query}`],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: GH_EVIDENCE_TIMEOUT_MS,
    },
  );
  let payload;
  try {
    payload = JSON.parse(response);
  } catch {
    throw new RunStateError("GitHub GraphQL returnerade ogiltig preview-ref JSON.", 8);
  }
  const repository = payload?.data?.repository;
  if (!repository || repository.nameWithOwner !== localRepository) {
    throw new RunStateError("GitHub preview-ref matchar inte lokal repository.", 8);
  }
  return {
    provider: "gh-api-graphql",
    repository: repository.nameWithOwner,
    localRepository,
    refName: DELIVERY_BASE,
    refSha: repository.preview?.target?.oid,
    observedAt: new Date().toISOString(),
  };
}

export function readLivePreviewPolicyEvidence({
  cwd = process.cwd(),
  execFile = execFileSync,
  localRepository: providedLocalRepository = null,
} = {}) {
  const localRepository =
    providedLocalRepository ??
    repositoryFromRemoteUrl(
      execFile("git", ["remote", "get-url", "origin"], {
        cwd,
        encoding: "utf8",
        timeout: GIT_EVIDENCE_TIMEOUT_MS,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      }).trim(),
    );
  const query = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){nameWithOwner preview:ref(qualifiedName:"refs/heads/${DELIVERY_BASE}"){target{oid}} agentWorkflow:object(expression:"${DELIVERY_BASE}:${WORKFLOW_POLICY_PATH}"){... on Blob{oid text isBinary}}}}`;
  const response = execFile(
    "gh",
    ["api", "graphql", "-F", "owner={owner}", "-F", "name={repo}", "-f", `query=${query}`],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: GH_EVIDENCE_TIMEOUT_MS,
    },
  );
  let payload;
  try {
    payload = JSON.parse(response);
  } catch {
    throw new RunStateError("GitHub GraphQL returnerade ogiltig preview-policy JSON.", 8);
  }
  const repository = payload?.data?.repository;
  if (!repository || repository.nameWithOwner !== localRepository) {
    throw new RunStateError("GitHub preview-policy matchar inte lokal repository.", 8);
  }
  const blob = repository.agentWorkflow;
  if (blob?.isBinary === true || typeof blob?.text !== "string") {
    throw new RunStateError("Canonical preview agent-workflow är saknad eller inte text.", 8);
  }
  let policy;
  try {
    policy = JSON.parse(blob.text);
  } catch {
    throw new RunStateError("Canonical preview agent-workflow innehåller ogiltig JSON.", 8);
  }
  return {
    provider: "gh-api-graphql",
    repository: repository.nameWithOwner,
    localRepository,
    refName: DELIVERY_BASE,
    refSha: repository.preview?.target?.oid,
    policyPath: WORKFLOW_POLICY_PATH,
    policyBlobSha: blob.oid,
    deliveryBranch: policy.deliveryBranch,
    observedAt: new Date().toISOString(),
  };
}

function repositoryFromRemoteUrl(remoteUrl) {
  const trimmed = remoteUrl.trim().replace(/\.git$/iu, "");
  let path;
  try {
    const parsed = new URL(trimmed);
    path = parsed.pathname.replace(/^\/+|\/+$/gu, "");
  } catch {
    const scpLike = /^(?:[^@]+@)?[^:]+:(.+)$/u.exec(trimmed);
    path = scpLike?.[1]?.replace(/^\/+|\/+$/gu, "");
  }
  const segments = path?.split("/").filter(Boolean) ?? [];
  const repository = segments.slice(-2).join("/");
  if (!REPOSITORY_PATTERN.test(repository)) {
    throw new RunStateError("origin kan inte bindas till owner/repository för PR-evidence.", 8);
  }
  return repository;
}

function metadataFrom(flags) {
  const metadata = {};
  if (flags.branch !== undefined) metadata.branch = flags.branch;
  if (flags.worktree !== undefined) metadata.worktree = resolve(flags.worktree);
  if (flags.note !== undefined) metadata.note = flags.note;
  return metadata;
}

function positiveIntegerFlag(flags, name) {
  const value = Number(flags[name]);
  if (!Number.isInteger(value) || value < 1) {
    throw new RunStateError(`--${name} måste vara ett positivt heltal.`);
  }
  return value;
}

function reviewSourceMetadataFrom(flags) {
  const metadata = {};
  if (flags["reviewer-model"] !== undefined) metadata.model = flags["reviewer-model"];
  if (flags.reviewer !== undefined) metadata.reviewer = flags.reviewer;
  if (flags["review-url"] !== undefined) metadata.url = flags["review-url"];
  if (flags["external-id"] !== undefined) metadata.externalId = flags["external-id"];
  if (flags.procedure !== undefined) metadata.procedure = flags.procedure;
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function rejectUntrustedEvidenceFlags(flags) {
  const rejected = [
    "sha",
    "merge-sha",
    "is-draft",
    "merge-forbidden",
    "admin-review-required",
    "pr-title-prefix",
    "pr-body-marker",
    "blocking-label",
  ].filter((name) => flags[name] !== undefined);
  if (rejected.length > 0) {
    throw new RunStateError(
      `Flaggorna ${rejected.map((name) => `--${name}`).join(", ")} är inte bevis; CLI hämtar live GitHub-evidence.`,
      8,
    );
  }
}

function liveEvidencePrNumber(state, flags, { allowRegistration = false } = {}) {
  if (state.current?.prNumber) {
    if (flags.pr !== undefined && positiveIntegerFlag(flags, "pr") !== state.current.prNumber) {
      throw new RunStateError("--pr matchar inte redan registrerat PR-nummer.", 8);
    }
    return state.current.prNumber;
  }
  if (!allowRegistration || flags.pr === undefined) {
    throw new RunStateError("Live PR-evidence kräver ett registrerat PR-nummer.", 8);
  }
  return positiveIntegerFlag(flags, "pr");
}

function archivePreviousRun(statePaths, state) {
  if (!state || state.status !== "completed") return;
  mkdirSync(statePaths.runs, { recursive: true });
  atomicWrite(join(statePaths.runs, `${state.runId}.json`), state);
}

function print(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function main(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  const statePaths = paths();
  let now = new Date();

  if (command === "queue") {
    const { backlogPath, candidates } = readCandidates(flags);
    print({ ok: true, backlogPath, count: candidates.length, candidates });
    return;
  }
  if (command === "status") {
    withMutex(statePaths.mutex, () => {
      const state = readState(statePaths.state, { persistMigration: true });
      print({ ok: true, statePath: statePaths.state, state });
    });
    return;
  }

  withMutex(statePaths.mutex, () => {
    if (command === "begin") {
      const previous = existsSync(statePaths.state) ? readState(statePaths.state) : null;
      if (previous && previous.status !== "completed") {
        throw new RunStateError(
          `Run ${previous.runId} är fortfarande ${previous.status}; startar inte en ny.`,
        );
      }
      archivePreviousRun(statePaths, previous);
      const mode = flags.mode ?? "pilot";
      const promotionCode = mode === "pilot" ? randomBytes(16).toString("hex") : null;
      const trustedRolloutEvidence = mode === "full" ? readLivePreviewPolicyEvidence() : null;
      now = new Date();
      const state = createRunState({
        count: numberFlag(flags, "count", 1),
        mode,
        cooldownMinutes: numberFlag(flags, "cooldown-minutes", DEFAULT_COOLDOWN_MINUTES),
        leaseMinutes: numberFlag(flags, "lease-minutes", DEFAULT_LEASE_MINUTES),
        now,
        runId: randomUUID(),
        promotionCode,
        automationId: flags["automation-id"] ?? null,
        trustedRolloutEvidence,
      });
      atomicWrite(statePaths.state, state);
      print({ ok: true, statePath: statePaths.state, promotionCode, state });
      return;
    }

    const state = readState(statePaths.state);
    assertWorktreeBinding(state, process.cwd());
    let next;
    let token;
    if (command === "acquire") {
      const trustedRolloutEvidence = state.mode === "full" ? readLivePreviewPolicyEvidence() : null;
      now = new Date();
      ({ state: next, token } = acquireLease(state, {
        now,
        trustedRolloutEvidence,
      }));
    } else if (command === "recover") {
      next = recoverStaleLease(state, { runId: flags["run-id"], reason: flags.reason, now });
    } else if (command === "claim") {
      const { candidates } = readCandidates(flags);
      next = claimCandidate(state, { token: flags.token, smId: flags["sm-id"], candidates, now });
    } else if (command === "stage") {
      const needsLiveEvidence =
        flags.name === "draft-pr" ||
        (state.mode === "full" &&
          ["ci-review", "ready-to-merge", "merged", "cleanup"].includes(flags.name));
      let trustedEvidence = null;
      if (needsLiveEvidence) {
        rejectUntrustedEvidenceFlags(flags);
        const prNumber = liveEvidencePrNumber(state, flags, {
          allowRegistration: flags.name === "draft-pr",
        });
        trustedEvidence = readLivePullRequestEvidence({
          prNumber,
          includeCleanup: flags.name === "cleanup",
        });
        now = new Date();
      }
      next = advanceStage(state, {
        token: flags.token,
        stage: flags.name,
        now,
        metadata: metadataFrom(flags),
        trustedEvidence,
      });
    } else if (command === "heartbeat") {
      next = heartbeatLease(state, { token: flags.token, now });
    } else if (command === "review") {
      rejectUntrustedEvidenceFlags(flags);
      const trustedEvidence = readLivePullRequestEvidence({
        prNumber: liveEvidencePrNumber(state, flags),
      });
      now = new Date();
      next = recordReviewPass(state, {
        token: flags.token,
        source: flags.source,
        verdict: flags.verdict,
        reviewedSha: flags["reviewed-sha"],
        reviewedBaseSha: flags["reviewed-base-sha"],
        note: flags.note,
        now,
        sourceMetadata: reviewSourceMetadataFrom(flags),
        trustedEvidence,
      });
    } else if (command === "complete") {
      rejectUntrustedEvidenceFlags(flags);
      const trustedEvidence = readLivePullRequestEvidence({
        prNumber: liveEvidencePrNumber(state, flags),
        includeCleanup: state.mode === "full",
      });
      now = new Date();
      next = completePass(state, {
        token: flags.token,
        outcome: flags.outcome,
        evidence: flags.evidence,
        now,
        trustedEvidence,
      });
    } else if (command === "re-review") {
      rejectUntrustedEvidenceFlags(flags);
      const trustedEvidence = readLivePullRequestEvidence({
        prNumber: liveEvidencePrNumber(state, flags),
      });
      now = new Date();
      next = reopenReview(state, {
        token: flags.token,
        reason: flags.reason,
        now,
        trustedEvidence,
      });
    } else if (command === "rebaseline-legacy") {
      rejectUntrustedEvidenceFlags(flags);
      const trustedEvidence = readLivePullRequestEvidence({
        prNumber: liveEvidencePrNumber(state, flags),
      });
      now = new Date();
      next = rebaselineLegacyState(state, {
        token: flags.token,
        reason: flags.reason,
        now,
        trustedEvidence,
      });
    } else if (command === "skip") {
      next = skipCandidate(state, { token: flags.token, reason: flags.reason, now });
    } else if (command === "pause") {
      next = pauseRun(state, { token: flags.token, reason: flags.reason, now });
    } else if (command === "resume") {
      next = resumeRun(state, { runId: flags["run-id"], reason: flags.reason, now });
    } else if (command === "promote") {
      const trustedRolloutEvidence = readLivePreviewPolicyEvidence();
      now = new Date();
      next = promoteRun(state, {
        runId: flags["run-id"],
        authorization: flags.authorization,
        reason: flags.reason,
        now,
        trustedRolloutEvidence,
      });
    } else if (command === "release") {
      next = releaseLease(state, { token: flags.token, reason: flags.reason, now });
    } else {
      throw new RunStateError(
        "Kommando krävs: queue|begin|status|acquire|recover|claim|stage|heartbeat|review|complete|re-review|rebaseline-legacy|skip|pause|resume|promote|release",
      );
    }

    assertWorktreeBinding(next, process.cwd());
    atomicWrite(statePaths.state, next);
    print({ ok: true, statePath: statePaths.state, token, state: next });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    const known = error instanceof RunStateError;
    const payload = {
      ok: false,
      error: error.message,
      ...(known && error.details ? { details: error.details } : {}),
    };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exit(known ? error.code : 1);
  }
}
