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
 * - only a send that REPORTED that it ran may resume: the builder's own state
 *   cannot say whose turn produced it, so a missing outcome stops the run
 *   rather than reading the previous build's terminal version as a fresh one,
 * - a builder-target switch, a disarm, or a timeout drops the watch.
 *
 * This module is pure (no DOM, no React, no timers) so every rule above is
 * unit-testable; `useOpenClawArmedContinuation` owns the polling and the send.
 */

import { isMandateActive, type ArmedMandate } from "@/lib/openclaw/debug/armed-mandate";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";

/**
 * How the builder send this watch owns ended. Mirrors `SendMessageOutcome`'s
 * discriminator rather than restating it, so a new outcome kind has to be
 * classified below instead of quietly inheriting "the turn ran".
 */
export type ArmedContinuationSendOutcome = SendMessageOutcome["status"];

/**
 * Which outcomes mean a builder turn actually RAN, and may therefore be read as
 * the finished build the mandate's next step should build on. A total record
 * over the union, so adding an outcome fails the typecheck here.
 */
const SEND_OUTCOME_RAN: Record<ArmedContinuationSendOutcome, boolean> = {
  // The turn reached the builder and produced a version.
  started: true,
  // No generation ran, but the prompt was consumed by the nested F3 round and
  // that round has its own version — there is something to continue from.
  settled: true,
  // Every refusal: stale base, the F3 env gate, the credit gate, a client or
  // server abort, a network failure. Nothing was built.
  rejected: false,
  failed: false,
  aborted: false,
};

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
  /** When the builder turn was first seen at all, by any signal. */
  observedAt: number | null;
  /**
   * True once a *strong* signal was seen (streaming, a running phase or a new
   * version). Chat growth alone is weak: the builder appends the outgoing user
   * message before generation starts, so it proves the turn began but says
   * nothing about the phase — a resume on that alone can land before the build
   * even starts.
   */
  observedStrong: boolean;
  /**
   * The builder send this watch owns. Written by that send itself once it
   * reaches the builder (`bindArmedContinuationSend`), never predicted here:
   * the composer awaits an attachment step between the click and the send, and
   * any other sender could claim a guessed id inside that window. Null until
   * the send arrives, and a send that never arrives leaves it null.
   */
  sendSeq: number | null;
  /**
   * How that send ended, written by the same send once `sendMessage` resolves.
   * Null while the turn is still in flight — and permanently null for a send
   * the composer dropped before it ever reached `sendMessage`, which is exactly
   * the case a resume must not be allowed to guess its way past.
   */
  sendOutcome: ArmedContinuationSendOutcome | null;
  /** Set when OpenClaw has been woken for this watch, so it fires only once. */
  resumedAt: number | null;
  /** When the builder last looked idle; reset whenever it streams again. */
  quietSince: number | null;
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
  /** The builder is holding a question or a plan that only the user can answer. */
  awaitingInput: boolean;
}

export type ArmedContinuationDecision =
  | { kind: "idle" }
  | { kind: "wait"; reason: string }
  | { kind: "resume"; versionId: string | null; versionStatus: string | null }
  | {
      kind: "abort";
      reason: string;
      /** Tell the user in the chat. False for an undramatic end. */
      notify: boolean;
      /** Drop the mandate too. False only when it is already gone or when the
       * mandate is passive by design (`review_next`). */
      disarm: boolean;
    };

export interface ArmedContinuationInput {
  watch: ArmedContinuationWatch | null;
  mandate: ArmedMandate | null;
  /** The resolved act gate: `OC_EDIT` AND the user's granted armed-autonomy
   * power (see `powers.ts`). Revoking either one aborts a running loop. */
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
/**
 * Grace period before a weak-only observation (chat growth) may resume. Long
 * enough for the builder to start streaming and for the context effect to
 * publish it; far shorter than any real build.
 */
export const CONTINUATION_WEAK_CONFIRM_MS = 8_000;
/**
 * How long a woken OpenClaw gets to produce its next step before the run is
 * considered finished. No auto-send by then means it chose to stop — an
 * ordinary ending, so the mandate closes without an alarm.
 */
export const CONTINUATION_RESUME_FOLLOWTHROUGH_MS = 180_000;
/** Absolute cap on a single watch, however slow the build is. */
export const CONTINUATION_MAX_WAIT_MS = 15 * 60_000;
/**
 * How long the auto-send gets to reach `sendMessage` and name itself. The click
 * is synchronous but the composer resolves attachments first — a Figma preview
 * fetch alone may take six seconds — so this is deliberately generous. Past it,
 * the send never got there and the watch has no turn of its own to follow.
 */
export const CONTINUATION_SEND_CLAIM_TIMEOUT_MS = 30_000;
/**
 * How long a builder that already looks finished may go without the send's own
 * outcome. `sendMessage` resolves when the stream closes, so by this point the
 * answer is normally already in; a long silence means it will not come.
 */
export const CONTINUATION_SEND_OUTCOME_TIMEOUT_MS = 60_000;
/**
 * How long the builder must look finished before that is believed. The context
 * the loop polls is published from a React effect, so individual fields land a
 * commit apart — the outcome of a send can still be missing at the instant
 * streaming stops. Waiting a moment lets the whole picture catch up.
 */
export const CONTINUATION_QUIET_MS = 2_000;
/**
 * How long a finished-looking turn may stay on the old version before the run
 * is called off. Focus normally moves within a second of the build landing.
 */
export const CONTINUATION_NO_VERSION_MS = 60_000;

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
    sendSeq: null,
    sendOutcome: null,
    observedAt: null,
    observedStrong: false,
    resumedAt: null,
    quietSince: null,
  };
}

/**
 * Flip `buildObserved` once the builder turn is visibly underway. Returns the
 * same object when nothing changed so callers can skip a store write.
 */
export function observeBuilderTurn(
  watch: ArmedContinuationWatch,
  snapshot: BuilderTurnSnapshot | null,
  now: number = Date.now(),
): ArmedContinuationWatch {
  if (!snapshot) return watch;

  const strong =
    snapshot.isStreaming ||
    (!!snapshot.activeVersionId && snapshot.activeVersionId !== watch.versionIdAtSend) ||
    (!!snapshot.versionStatus && RUNNING_VERSION_STATUSES.has(snapshot.versionStatus));
  // A turn short enough to slip between two polls (a clarification question,
  // say) still leaves messages behind — but so does the outgoing message the
  // auto-send just posted, hence "weak".
  const weak =
    typeof snapshot.chatMessageCount === "number" &&
    typeof watch.messageCountAtSend === "number" &&
    snapshot.chatMessageCount > watch.messageCountAtSend;

  const next: ArmedContinuationWatch = {
    ...watch,
    observedAt: watch.observedAt ?? (strong || weak ? now : null),
    observedStrong: watch.observedStrong || strong,
    quietSince: snapshot.isStreaming ? null : (watch.quietSince ?? now),
  };

  const unchanged =
    next.observedAt === watch.observedAt &&
    next.observedStrong === watch.observedStrong &&
    next.quietSince === watch.quietSince;
  return unchanged ? watch : next;
}

/** Mark the watch as woken so a single builder turn can resume only once. */
export function markContinuationResumed(
  watch: ArmedContinuationWatch,
  now: number = Date.now(),
): ArmedContinuationWatch {
  return { ...watch, resumedAt: now };
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
    return { kind: "abort", reason: "Redigeringsläget är av.", notify: false, disarm: false };
  }

  // A spent mandate, a disarm and `review_next` all land here. None of them is
  // an anomaly, so the chat stays quiet and nothing needs disarming.
  if (!isMandateActive(mandate) || mandate?.mode !== "followups") {
    return { kind: "abort", reason: "Mandatet är slut.", notify: false, disarm: false };
  }

  if (snapshot?.chatId && watch.chatId && snapshot.chatId !== watch.chatId) {
    return {
      kind: "abort",
      reason: "Autonomin stoppades: builder-chatten byttes under bygget.",
      notify: true,
      disarm: true,
    };
  }

  // Already woken for this turn. Either OpenClaw answers with another auto-send
  // (which registers a fresh watch) or it decides to stop — an ordinary end.
  if (watch.resumedAt !== null) {
    // The next auto-send can only appear once the woken answer is complete, so
    // the follow-through clock must not run while it is still being written.
    if (openClawStreaming) {
      return { kind: "wait", reason: "Sajtagenten skriver sitt nästa steg." };
    }
    if (now - watch.resumedAt > CONTINUATION_RESUME_FOLLOWTHROUGH_MS) {
      return {
        kind: "abort",
        reason: "Mandatet avslutades: inget nytt steg kom.",
        notify: false,
        disarm: true,
      };
    }
    return { kind: "wait", reason: "Väntar på Sajtagentens nästa steg." };
  }

  if (now - watch.startedAt > CONTINUATION_MAX_WAIT_MS) {
    return {
      kind: "abort",
      reason: "Autonomin stoppades: bygget blev aldrig klart i tid.",
      notify: true,
      disarm: true,
    };
  }

  // The builder refused the turn (stale base, F3 env gate, credit gate, an
  // abort). Checked before the observation gate because a refusal can erase its
  // own trace — the optimistic message is rolled back, leaving nothing to see.
  // The outcome is written by the send that claimed this watch, so a refusal
  // belonging to any other sender never reaches us.
  if (watch.sendOutcome !== null && !SEND_OUTCOME_RAN[watch.sendOutcome]) {
    return {
      kind: "abort",
      reason: "Autonomin stoppades: buildern tog inte emot sändningen.",
      notify: true,
      disarm: true,
    };
  }

  // The builder is waiting for the user — a clarification, or a plan that needs
  // approving. Autonomy drives the same composer, so continuing here would
  // answer on the user's behalf and, for a pending plan, start a generation
  // that discards it. The mandate delegated follow-ups, not consent.
  if (snapshot?.awaitingInput) {
    return {
      kind: "abort",
      reason: "Autonomin stoppades: buildern väntar på ditt svar.",
      notify: true,
      disarm: true,
    };
  }

  if (watch.observedAt === null) {
    if (now - watch.startedAt > CONTINUATION_START_TIMEOUT_MS) {
      return {
        kind: "abort",
        reason: "Autonomin stoppades: bygget startade aldrig efter utskicket.",
        notify: true,
        disarm: true,
      };
    }
    return { kind: "wait", reason: "Väntar på att builderturen startar." };
  }

  // Chat growth alone can just be the outgoing message the auto-send posted.
  // Give the builder a moment to reveal a real phase before trusting a status
  // that may still describe the PREVIOUS version.
  if (!watch.observedStrong && now - watch.observedAt < CONTINUATION_WEAK_CONFIRM_MS) {
    return { kind: "wait", reason: "Låter builderturen sätta sig." };
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
        disarm: true,
      };
    }
    return { kind: "wait", reason: "En nyare version än den visade byggs." };
  }

  if (snapshot.versionStatus && FAILED_VERSION_STATUSES.has(snapshot.versionStatus)) {
    return {
      kind: "abort",
      reason: "Autonomin stoppades: den senaste versionen gick inte igenom.",
      notify: true,
      disarm: true,
    };
  }

  if (!snapshot.versionStatus || !TERMINAL_VERSION_STATUSES.has(snapshot.versionStatus)) {
    return { kind: "wait", reason: "Versionen är inte färdigbehandlad." };
  }

  if (openClawStreaming) {
    return { kind: "wait", reason: "Sajtagenten svarar redan." };
  }

  // Everything above says the turn is done, but the fields were published a
  // commit apart. Let the picture hold still briefly before acting on it.
  if (watch.quietSince === null || now - watch.quietSince < CONTINUATION_QUIET_MS) {
    return { kind: "wait", reason: "Låter builderns läge stabilisera sig." };
  }

  // The focused version is still the one we sent from. A terminal status on it
  // describes the PREVIOUS build, not this turn — focus moves only once the new
  // row exists. Every other ending is already handled above (refusal, failure,
  // a held question), so a turn that never yields a version has nothing for the
  // next step to build on.
  if (!snapshot.activeVersionId || snapshot.activeVersionId === watch.versionIdAtSend) {
    if (now - watch.quietSince > CONTINUATION_NO_VERSION_MS) {
      return {
        kind: "abort",
        reason: "Autonomin stoppades: turen gav ingen ny version att bygga vidare på.",
        notify: true,
        disarm: true,
      };
    }
    return { kind: "wait", reason: "Väntar på att turens version dyker upp." };
  }

  // Everything above is read off the BUILDER, and the builder cannot say whose
  // turn it is describing. The last gate is the mandate's own send confirming
  // that it ran: `sendMessage` reports a `SendMessageOutcome` and the send
  // writes it onto this watch. Requiring that answer is what makes the loop
  // default-closed. Before it, "no refusal was seen" counted as success, so a
  // refusal the outcome contract does not cover — or a send the composer
  // dropped before `sendMessage` ever ran — left the PREVIOUS build's terminal
  // version standing in for a finished turn, and the mandate spent a step on a
  // turn that never happened.
  if (watch.sendSeq === null) {
    if (now - watch.startedAt > CONTINUATION_SEND_CLAIM_TIMEOUT_MS) {
      return {
        kind: "abort",
        reason: "Autonomin stoppades: min sändning nådde aldrig buildern.",
        notify: true,
        disarm: true,
      };
    }
    return { kind: "wait", reason: "Väntar på att sändningen når buildern." };
  }

  if (watch.sendOutcome === null) {
    if (now - watch.quietSince > CONTINUATION_SEND_OUTCOME_TIMEOUT_MS) {
      return {
        kind: "abort",
        reason: "Autonomin stoppades: jag kunde inte bekräfta att turen kördes.",
        notify: true,
        disarm: true,
      };
    }
    return { kind: "wait", reason: "Väntar på utfallet av min sändning." };
  }

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
