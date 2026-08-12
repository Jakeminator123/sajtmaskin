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
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SKILL_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const DEFAULT_BACKLOG = resolve(SKILL_ROOT, "..", "..", "..", "BUG-SWARM-BACKLOG.md");
const STATE_VERSION = 2;
const DEFAULT_COOLDOWN_MINUTES = 5;
const DEFAULT_LEASE_MINUTES = 240;
const MUTEX_STALE_MS = 60_000;

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

const MODES = new Set(["pilot", "full"]);
const OUTCOMES = new Set(["fixed", "already-resolved", "reclassified"]);
const REVIEW_SOURCES = new Set(["bugbot", "bugbot-local", "pr-ai-review", "codex", "manual"]);
const REVIEW_VERDICTS = new Set(["clean", "findings-fixed", "blocked"]);
const SHA_PATTERN = /^[a-f0-9]{40}$/iu;
const BRANCH_PATTERN = /^(?:fix|feat|docs|chore)\/[a-z0-9][a-z0-9._/-]*$/u;
const PILOT_CEILING = STAGES.indexOf("draft-pr");

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
  if (!Number.isFinite(cooldownMinutes) || cooldownMinutes < 0 || cooldownMinutes > 1440) {
    throw new RunStateError("cooldown-minutes måste vara mellan 0 och 1440.");
  }
  if (!Number.isFinite(leaseMinutes) || leaseMinutes < 5 || leaseMinutes > 1440) {
    throw new RunStateError("lease-minutes måste vara mellan 5 och 1440.");
  }

  const timestamp = toIso(now);
  return {
    version: STATE_VERSION,
    runId,
    mode,
    automationId,
    promotionAuthorizationHash:
      mode === "pilot" ? createHash("sha256").update(promotionCode).digest("hex") : null,
    requestedPasses: count,
    completedPasses: 0,
    remainingPasses: count,
    cooldownMinutes,
    leaseMinutes,
    status: "ready",
    createdAt: timestamp,
    updatedAt: timestamp,
    notBefore: null,
    pauseReason: null,
    lease: null,
    current: null,
    history: [],
  };
}

export function acquireLease(state, { now, token = randomUUID() }) {
  const next = clone(state);
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

  next.status = "running";
  next.notBefore = null;
  next.lease = {
    token,
    acquiredAt: timestamp,
    heartbeatAt: timestamp,
    expiresAt: addMinutes(timestamp, next.leaseMinutes),
  };
  next.updatedAt = timestamp;
  return { state: next, token };
}

export function recoverStaleLease(state, { runId, reason, now }) {
  const next = clone(state);
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
  const next = clone(state);
  assertLease(next, token, now);
  if (!/^SM-\d{3}$/u.test(smId ?? "")) throw new RunStateError("claim kräver ett giltigt --sm-id.");
  const candidate = candidates.find((row) => row.id === smId);
  if (!candidate) throw new RunStateError(smId + " finns inte i dagens ## Aktiv kö.");
  if (
    next.history.some((entry) => entry.kind === "candidate-skipped" && entry.item?.smId === smId)
  ) {
    throw new RunStateError(
      smId + " har redan skippats i den här batchen; välj en annan kandidat.",
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
    note: null,
  };
  next.updatedAt = toIso(now);
  return next;
}

export function advanceStage(state, { token, stage, now, metadata = {} }) {
  const next = clone(state);
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
  if (next.mode !== "full" && newIndex > PILOT_CEILING) {
    throw new RunStateError(
      "Pilot mode får inte gå förbi draft-pr; uttrycklig capability-promotion krävs.",
      8,
    );
  }
  next.current.stage = stage;
  for (const key of ["branch", "worktree", "prNumber"]) {
    if (
      metadata[key] !== undefined &&
      next.current[key] !== null &&
      metadata[key] !== next.current[key]
    ) {
      throw new RunStateError(`${key} är immutable efter första registreringen.`);
    }
  }
  for (const key of ["branch", "worktree", "prNumber", "headSha", "mergeSha", "note"]) {
    if (metadata[key] !== undefined) next.current[key] = metadata[key];
  }
  validateStageEvidence(next.current);
  next.updatedAt = toIso(now);
  next.lease.heartbeatAt = toIso(now);
  next.lease.expiresAt = addMinutes(next.lease.heartbeatAt, next.leaseMinutes);
  return next;
}

export function heartbeatLease(state, { token, now }) {
  const next = clone(state);
  assertLease(next, token, now);
  next.lease.heartbeatAt = toIso(now);
  next.lease.expiresAt = addMinutes(next.lease.heartbeatAt, next.leaseMinutes);
  next.updatedAt = toIso(now);
  return next;
}

export function recordReviewPass(state, { token, source, verdict, sha, note, now }) {
  const next = clone(state);
  assertLease(next, token, now);
  if (!next.current) throw new RunStateError("Ingen kandidat är claimad.");
  const stageIndex = STAGES.indexOf(next.current.stage);
  if (stageIndex < STAGES.indexOf("draft-pr") || stageIndex > STAGES.indexOf("ready-to-merge")) {
    throw new RunStateError("PR-review får bara registreras mellan draft-pr och ready-to-merge.");
  }
  if (!REVIEW_SOURCES.has(source)) throw new RunStateError(`Okänd reviewkälla: ${source}`);
  if (!REVIEW_VERDICTS.has(verdict)) throw new RunStateError(`Okänd reviewverdict: ${verdict}`);
  if (!SHA_PATTERN.test(sha ?? "") || sha !== next.current.headSha) {
    throw new RunStateError("Review-SHA måste vara exakt aktuell 40-teckens head-SHA.");
  }
  if (next.current.reviewPasses.length >= 3) {
    throw new RunStateError("Högst tre PR-reviewpass är tillåtna; pausa för ägartriage.", 8);
  }
  const timestamp = toIso(now);
  next.current.reviewPasses.push({
    at: timestamp,
    source,
    verdict,
    sha,
    note: note?.trim() || null,
  });
  next.updatedAt = timestamp;
  next.lease.heartbeatAt = timestamp;
  next.lease.expiresAt = addMinutes(timestamp, next.leaseMinutes);
  return next;
}

export function completePass(state, { token, outcome, evidence, now }) {
  const next = clone(state);
  assertLease(next, token, now);
  if (!OUTCOMES.has(outcome)) throw new RunStateError(`Okänt outcome: ${outcome}`);
  if (!evidence?.trim()) throw new RunStateError("complete kräver --evidence.");
  if (!next.current) throw new RunStateError("Ingen kandidat är claimad.");
  if (next.mode !== "full") {
    throw new RunStateError("Endast en uttryckligen armerad full-run får räknas som mergad.", 8);
  }
  if (next.current.stage !== "cleanup") {
    throw new RunStateError(
      `Passet får räknas först efter merge och cleanup; nuvarande stage är ${next.current.stage}.`,
    );
  }
  validateStageEvidence(next.current);

  const timestamp = toIso(now);
  next.history.push({
    kind: "pass-completed",
    at: timestamp,
    outcome,
    evidence: evidence.trim(),
    item: next.current,
  });
  next.completedPasses += 1;
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

export function skipCandidate(state, { token, reason, now }) {
  const next = clone(state);
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
  const next = clone(state);
  assertLease(next, token, now);
  if (!reason?.trim()) throw new RunStateError("pause kräver --reason.");
  next.status = "paused";
  next.pauseReason = reason.trim();
  next.lease = null;
  next.updatedAt = toIso(now);
  return next;
}

export function resumeRun(state, { runId, reason, now }) {
  const next = clone(state);
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

export function promoteRun(state, { runId, authorization, reason, now }) {
  const next = clone(state);
  assertRunId(next, runId);
  if (next.status !== "paused") throw new RunStateError("Bara en pausad run kan promoveras.");
  if (next.mode === "full") throw new RunStateError("Runnen är redan i full mode.");
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
  const timestamp = toIso(now);
  next.history.push({
    kind: "run-promoted",
    at: timestamp,
    fromMode: next.mode,
    toMode: "full",
    reason: reason.trim(),
  });
  next.mode = "full";
  next.promotionAuthorizationHash = null;
  next.status = "ready";
  next.pauseReason = null;
  next.notBefore = null;
  next.updatedAt = timestamp;
  return next;
}

export function releaseLease(state, { token, reason, now }) {
  const next = clone(state);
  assertLease(next, token, now);
  if (!reason?.trim()) throw new RunStateError("release kräver --reason.");
  const timestamp = toIso(now);
  next.history.push({ kind: "lease-released", at: timestamp, reason: reason.trim() });
  next.lease = null;
  next.status = "ready";
  next.updatedAt = timestamp;
  return next;
}

function validateStageEvidence(current) {
  const stageIndex = STAGES.indexOf(current.stage);
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
  }
  if (stageIndex >= STAGES.indexOf("ready-to-merge")) {
    const currentReview = current.reviewPasses.some(
      (review) =>
        review.sha === current.headSha &&
        (review.verdict === "clean" || review.verdict === "findings-fixed"),
    );
    if (!currentReview) {
      throw new RunStateError(
        "ready-to-merge kräver en godkänd review för exakt aktuell head-SHA.",
      );
    }
  }
  if (stageIndex >= STAGES.indexOf("merged") && !SHA_PATTERN.test(current.mergeSha ?? "")) {
    throw new RunStateError("merged kräver en exakt 40-teckens merge-SHA.");
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

function normalizeFsPath(path) {
  return resolve(path)
    .replace(/[\\/]+$/u, "")
    .toLowerCase();
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
  if (!state.lease || state.lease.token !== token)
    throw new RunStateError("Ogiltig eller saknad runner-token.", 3);
  if (Date.parse(state.lease.expiresAt) <= Date.parse(toIso(now))) {
    throw new RunStateError("Runner-token har gått ut; använd recover efter säker kontroll.", 6, {
      expiredAt: state.lease.expiresAt,
    });
  }
}

function clone(value) {
  return structuredClone(value);
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

function readState(statePath) {
  if (!existsSync(statePath)) throw new RunStateError("Ingen godnatt-bugg-run finns.", 4);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.version !== STATE_VERSION)
    throw new RunStateError(`Okänd state-version: ${state.version}`);
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
  if (existsSync(mutexPath) && Date.now() - statSync(mutexPath).mtimeMs > MUTEX_STALE_MS) {
    unlinkSync(mutexPath);
  }
  let fd;
  try {
    fd = openSync(mutexPath, "wx");
  } catch (error) {
    if (error.code === "EEXIST")
      throw new RunStateError("Stateverktyget används av en annan process.", 3);
    throw error;
  }
  try {
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

function metadataFrom(flags) {
  const metadata = {};
  if (flags.branch !== undefined) metadata.branch = flags.branch;
  if (flags.worktree !== undefined) metadata.worktree = resolve(flags.worktree);
  if (flags.pr !== undefined) {
    const prNumber = Number(flags.pr);
    if (!Number.isInteger(prNumber) || prNumber < 1) {
      throw new RunStateError("--pr måste vara ett positivt heltal.");
    }
    metadata.prNumber = prNumber;
  }
  if (flags.sha !== undefined) metadata.headSha = flags.sha;
  if (flags["merge-sha"] !== undefined) metadata.mergeSha = flags["merge-sha"];
  if (flags.note !== undefined) metadata.note = flags.note;
  return metadata;
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
  const now = new Date();

  if (command === "queue") {
    const { backlogPath, candidates } = readCandidates(flags);
    print({ ok: true, backlogPath, count: candidates.length, candidates });
    return;
  }
  if (command === "status") {
    print({ ok: true, statePath: statePaths.state, state: readState(statePaths.state) });
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
      const state = createRunState({
        count: numberFlag(flags, "count", 1),
        mode,
        cooldownMinutes: numberFlag(flags, "cooldown-minutes", DEFAULT_COOLDOWN_MINUTES),
        leaseMinutes: numberFlag(flags, "lease-minutes", DEFAULT_LEASE_MINUTES),
        now,
        runId: randomUUID(),
        promotionCode,
        automationId: flags["automation-id"] ?? null,
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
      ({ state: next, token } = acquireLease(state, { now }));
    } else if (command === "recover") {
      next = recoverStaleLease(state, { runId: flags["run-id"], reason: flags.reason, now });
    } else if (command === "claim") {
      const { candidates } = readCandidates(flags);
      next = claimCandidate(state, { token: flags.token, smId: flags["sm-id"], candidates, now });
    } else if (command === "stage") {
      next = advanceStage(state, {
        token: flags.token,
        stage: flags.name,
        now,
        metadata: metadataFrom(flags),
      });
    } else if (command === "heartbeat") {
      next = heartbeatLease(state, { token: flags.token, now });
    } else if (command === "review") {
      next = recordReviewPass(state, {
        token: flags.token,
        source: flags.source,
        verdict: flags.verdict,
        sha: flags.sha,
        note: flags.note,
        now,
      });
    } else if (command === "complete") {
      next = completePass(state, {
        token: flags.token,
        outcome: flags.outcome,
        evidence: flags.evidence,
        now,
      });
    } else if (command === "skip") {
      next = skipCandidate(state, { token: flags.token, reason: flags.reason, now });
    } else if (command === "pause") {
      next = pauseRun(state, { token: flags.token, reason: flags.reason, now });
    } else if (command === "resume") {
      next = resumeRun(state, { runId: flags["run-id"], reason: flags.reason, now });
    } else if (command === "promote") {
      next = promoteRun(state, {
        runId: flags["run-id"],
        authorization: flags.authorization,
        reason: flags.reason,
        now,
      });
    } else if (command === "release") {
      next = releaseLease(state, { token: flags.token, reason: flags.reason, now });
    } else {
      throw new RunStateError(
        "Kommando krävs: queue|begin|status|acquire|recover|claim|stage|heartbeat|review|complete|skip|pause|resume|promote|release",
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
