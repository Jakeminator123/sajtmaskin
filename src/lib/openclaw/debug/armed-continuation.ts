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
  /** When the auto-send fired (drives the timeouts). */
  startedAt: number;
  /** Builder chat length at auto-send time — growth proves the turn happened
   * even when it was too fast for the poll to catch it streaming. */
  messageCountAtSend: number | null;
  /** True once the builder turn has visibly started. */
  buildObserved: boolean;
}

/** Live builder state, read from `window.__SITEMASKIN_CONTEXT`. */
export interface BuilderTurnSnapshot {
  chatId: string | null;
  activeVersionId: string | null;
  isStreaming: boolean;
  /** Status of the FOCUSED version — only meaningful when it is the latest. */
  versionStatus: string | null;
  /** False while the user reads an older version than the one being built. */
  versionIsLatest: boolean;
  /** Number of messages in the builder chat. */
  chatMessageCount: number | null;
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
/**
 * How long a finished-but-unreadable turn may block the loop. Happens when the
 * user pins the view to an older version: a newer one exists but its status is
 * not projected anywhere we can see. Stopping with a clear reason beats holding
 * the mandate hostage until the absolute cap.
 */
export const CONTINUATION_STALE_VIEW_TIMEOUT_MS = 120_000;
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

/**
 * Only these count as "the turn is genuinely done". `idle` is deliberately
 * absent: it is also what an empty or still-loading status projection looks
 * like, and resuming there would hand OpenClaw a half-finished turn. An
 * unknown status therefore waits (and eventually times out) instead of
 * resuming on a guess.
 */
const TERMINAL_VERSION_STATUSES = new Set(["ready", "promoted", "degraded"]);

export function createArmedContinuationWatch(
  snapshot: BuilderTurnSnapshot | null,
  now: number = Date.now(),
): ArmedContinuationWatch {
  return {
    chatId: snapshot?.chatId ?? null,
    versionIdAtSend: snapshot?.activeVersionId ?? null,
    startedAt: now,
    messageCountAtSend: snapshot?.chatMessageCount ?? null,
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
  // A turn short enough to slip between two polls (a clarification question,
  // say) still leaves messages behind.
  const grewChat =
    typeof snapshot.chatMessageCount === "number" &&
    typeof watch.messageCountAtSend === "number" &&
    snapshot.chatMessageCount > watch.messageCountAtSend;
  if (!startedStreaming && !newVersion && !runningStatus && !grewChat) return watch;
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

  // No builder in sight (the user navigated away, or the context is mid-swap).
  // Autonomy drives the builder composer, so it must never resume blind.
  if (!snapshot) {
    return { kind: "wait", reason: "Ingen builder-kontext att fortsätta i." };
  }

  if (snapshot.isStreaming) {
    return { kind: "wait", reason: "Builderturen pågår." };
  }

  // The status belongs to the focused version. While that is not the latest
  // one, a terminal status says nothing about the turn we started — so wait,
  // but not forever: nothing will change while the view stays pinned.
  if (!snapshot.versionIsLatest) {
    if (now - watch.startedAt > CONTINUATION_STALE_VIEW_TIMEOUT_MS) {
      return {
        kind: "abort",
        reason:
          "Autonomin stoppades: en nyare version finns än den du tittar på, så jag kan inte läsa resultatet.",
        notify: true,
      };
    }
    return { kind: "wait", reason: "En nyare version än den visade byggs." };
  }

  if (snapshot.versionStatus && FAILED_VERSION_STATUSES.has(snapshot.versionStatus)) {
    return {
      kind: "abort",
      reason: "Autonomin stoppades: den senaste versionen gick inte igenom.",
      notify: true,
    };
  }

  if (!snapshot.versionStatus || !TERMINAL_VERSION_STATUSES.has(snapshot.versionStatus)) {
    return { kind: "wait", reason: "Versionen är inte färdigbehandlad." };
  }

  if (openClawStreaming) {
    return { kind: "wait", reason: "Sajtagenten svarar redan." };
  }

  // A turn that ends with the builder asking the user something (clarification,
  // plan approval) also lands here, and resuming is deliberate: the mandate
  // delegated the composer, so answering is how the run makes progress. Left
  // unanswered it would stall until the cap. The step is bounded, visible in
  // the chat, and "stopp" ends it.

  return {
    kind: "resume",
    versionId: snapshot.activeVersionId,
    versionStatus: snapshot.versionStatus,
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
