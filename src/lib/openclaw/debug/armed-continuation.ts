/**
 * Continuation handshake for the armed-autonomy mandate (Mode A).
 *
 * Without this module a mandate of N follow-ups produces exactly ONE auto-send:
 * `OpenClawArmedSendCard` fills the builder composer, clicks send, consumes a
 * step — and then nothing ever wakes OpenClaw again, so the remaining steps sit
 * unused. The handshake closes that loop: after an auto-send we watch the
 * builder turn, and when it reaches a terminal state we resume OpenClaw once
 * with fresh context so it can decide the next step.
 *
 * The rules are deliberately restrictive — autonomy that keeps running when the
 * user thinks it stopped is worse than autonomy that stops too early:
 *
 * - only a `followups` mandate resumes (`review_next` is passive by design),
 * - only one resume per auto-send, and never while OpenClaw is still streaming,
 * - a failed/blocked build stops the mandate instead of piling on more work,
 * - a builder-target switch, a disarm, or a timeout drops the watch.
 *
 * This module is pure (no DOM, no React, no timers) so every rule above is
 * unit-testable; `useOpenClawArmedContinuation` owns the polling and the send.
 */

import { isMandateActive, type ArmedMandate } from "@/lib/openclaw/debug/armed-mandate";

/** Pending "an auto-send happened, watch the builder turn" record. */
export interface ArmedContinuationWatch {
  /** Builder chat the auto-send targeted. A switch invalidates the watch. */
  chatId: string | null;
  /** Active version at auto-send time — a new id means the turn produced one. */
  versionIdAtSend: string | null;
  /** When the auto-send fired (drives both timeouts). */
  startedAt: number;
  /** True once the builder turn has visibly started. */
  buildObserved: boolean;
}

/** Live builder state, read from `window.__SITEMASKIN_CONTEXT`. */
export interface BuilderTurnSnapshot {
  chatId: string | null;
  activeVersionId: string | null;
  isStreaming: boolean;
  versionStatus: string | null;
}

export type ArmedContinuationDecision =
  | { kind: "idle" }
  | { kind: "wait"; reason: string }
  | { kind: "resume"; versionId: string | null; versionStatus: string | null }
  /** `notify` = tell the user in the chat; false for an undramatic end. */
  | { kind: "abort"; reason: string; notify: boolean };

export interface ArmedContinuationInput {
  watch: ArmedContinuationWatch | null;
  mandate: ArmedMandate | null;
  editEnabled: boolean;
  /** OpenClaw's own stream — a resume must never overlap an in-flight turn. */
  openClawStreaming: boolean;
  snapshot: BuilderTurnSnapshot | null;
  now: number;
}

/** How long we wait for the builder turn to visibly start before giving up. */
export const CONTINUATION_START_TIMEOUT_MS = 90_000;
/** Absolute cap on a single watch, however slow the build is. */
export const CONTINUATION_MAX_WAIT_MS = 15 * 60_000;

const RUNNING_VERSION_STATUSES = new Set([
  "generating",
  "autofixing",
  "validating",
  "preflighting",
  "verifying",
  "repairing",
  "retrying",
]);

const FAILED_VERSION_STATUSES = new Set(["failed", "blocked"]);

export function createArmedContinuationWatch(
  snapshot: BuilderTurnSnapshot | null,
  now: number = Date.now(),
): ArmedContinuationWatch {
  return {
    chatId: snapshot?.chatId ?? null,
    versionIdAtSend: snapshot?.activeVersionId ?? null,
    startedAt: now,
    buildObserved: false,
  };
}

/**
 * Flip `buildObserved` once the builder turn is visibly underway. Returns the
 * same object when nothing changed so callers can skip a store write.
 */
export function observeBuilderTurn(
  watch: ArmedContinuationWatch,
  snapshot: BuilderTurnSnapshot | null,
): ArmedContinuationWatch {
  if (watch.buildObserved || !snapshot) return watch;
  const startedStreaming = snapshot.isStreaming;
  const newVersion =
    !!snapshot.activeVersionId && snapshot.activeVersionId !== watch.versionIdAtSend;
  const runningStatus =
    !!snapshot.versionStatus && RUNNING_VERSION_STATUSES.has(snapshot.versionStatus);
  if (!startedStreaming && !newVersion && !runningStatus) return watch;
  return { ...watch, buildObserved: true };
}

/**
 * Decide what the continuation loop should do right now. Order matters: every
 * disarm/ownership rule is checked before any resume can be reached.
 */
export function decideArmedContinuation(
  input: ArmedContinuationInput,
): ArmedContinuationDecision {
  const { watch, mandate, editEnabled, openClawStreaming, snapshot, now } = input;

  if (!watch) return { kind: "idle" };

  if (!editEnabled) {
    return { kind: "abort", reason: "Redigeringsläget är av.", notify: false };
  }

  // A spent mandate, a disarm and `review_next` all land here. None of them is
  // an anomaly, so the chat stays quiet.
  if (!isMandateActive(mandate) || mandate?.mode !== "followups") {
    return { kind: "abort", reason: "Mandatet är slut.", notify: false };
  }

  if (snapshot?.chatId && watch.chatId && snapshot.chatId !== watch.chatId) {
    return {
      kind: "abort",
      reason: "Autonomin stoppades: builder-chatten byttes under bygget.",
      notify: true,
    };
  }

  if (now - watch.startedAt > CONTINUATION_MAX_WAIT_MS) {
    return {
      kind: "abort",
      reason: "Autonomin stoppades: bygget blev aldrig klart i tid.",
      notify: true,
    };
  }

  if (!watch.buildObserved) {
    if (now - watch.startedAt > CONTINUATION_START_TIMEOUT_MS) {
      return {
        kind: "abort",
        reason: "Autonomin stoppades: bygget startade aldrig efter utskicket.",
        notify: true,
      };
    }
    return { kind: "wait", reason: "Väntar på att builderturen startar." };
  }

  if (snapshot?.isStreaming) {
    return { kind: "wait", reason: "Builderturen pågår." };
  }

  if (snapshot?.versionStatus && RUNNING_VERSION_STATUSES.has(snapshot.versionStatus)) {
    return { kind: "wait", reason: "Versionen är inte färdigbehandlad." };
  }

  if (snapshot?.versionStatus && FAILED_VERSION_STATUSES.has(snapshot.versionStatus)) {
    return {
      kind: "abort",
      reason: "Autonomin stoppades: den senaste versionen gick inte igenom.",
      notify: true,
    };
  }

  if (openClawStreaming) {
    return { kind: "wait", reason: "Sajtagenten svarar redan." };
  }

  return {
    kind: "resume",
    versionId: snapshot?.activeVersionId ?? null,
    versionStatus: snapshot?.versionStatus ?? null,
  };
}

/**
 * The wake-up turn OpenClaw receives. It must read as an instruction to decide
 * the next step — never as a fresh arming directive, or the mandate counter
 * would reset itself and the loop would never end. `useOpenClawChat` also skips
 * arming for this turn; the wording is the second line of defence and is locked
 * by a test.
 */
export function buildArmedContinuationPrompt(input: {
  remaining: number;
  versionStatus: string | null;
}): string {
  const statusPart = input.versionStatus ? ` Versionens status: ${input.versionStatus}.` : "";
  const stepPart =
    input.remaining > 1
      ? ` Du har ${input.remaining} steg kvar i mandatet.`
      : " Detta är sista steget i mandatet.";
  return (
    "[Automatisk fortsättning] Builderturen är klar." +
    statusPart +
    " Läs resultatet i kontexten och avgör vad som ska hända nu:" +
    " antingen ett nytt förbättringsförslag som fylls i builder-fältet," +
    " eller ett besked om att sajten är bra som den är." +
    stepPart
  );
}
