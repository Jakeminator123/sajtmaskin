import { describe, it, expect } from "vitest";
import {
  buildArmedContinuationPrompt,
  createArmedContinuationWatch,
  decideArmedContinuation,
  observeBuilderTurn,
  CONTINUATION_MAX_WAIT_MS,
  CONTINUATION_NO_VERSION_MS,
  CONTINUATION_QUIET_MS,
  CONTINUATION_RESUME_FOLLOWTHROUGH_MS,
  CONTINUATION_STALE_VIEW_TIMEOUT_MS,
  CONTINUATION_START_TIMEOUT_MS,
  CONTINUATION_WEAK_CONFIRM_MS,
  type ArmedContinuationInput,
  type ArmedContinuationWatch,
  type BuilderTurnSnapshot,
} from "./armed-continuation";
import {
  createArmedMandate,
  parseArmingDirective,
  parseStopDirective,
  type ArmedMandate,
} from "./armed-mandate";

const NOW = 1_800_000_000_000;

function mandate(mode: "followups" | "review_next", remaining: number): ArmedMandate {
  return { mode, remaining, reason: "gör 3 follow-ups", createdAt: NOW - 1000 };
}

function snapshot(overrides: Partial<BuilderTurnSnapshot> = {}): BuilderTurnSnapshot {
  return {
    chatId: "chat-1",
    activeVersionId: "ver-2",
    isStreaming: false,
    versionStatus: "ready",
    versionIsLatest: true,
    rejectedSendSeq: null,
    rejectedAt: null,
    awaitingInput: false,
    chatMessageCount: 4,
    ...overrides,
  };
}

function watching(overrides: Partial<ArmedContinuationWatch> = {}): ArmedContinuationWatch {
  return {
    chatId: "chat-1",
    versionIdAtSend: "ver-1",
    startedAt: NOW - 5000,
    messageCountAtSend: 4,
    sendSeq: 7,
    observedAt: NOW - 4000,
    observedStrong: true,
    resumedAt: null,
    quietSince: NOW - 4000,
    ...overrides,
  };
}

function decide(overrides: Partial<ArmedContinuationInput> = {}) {
  return decideArmedContinuation({
    watch: watching(),
    mandate: mandate("followups", 2),
    editEnabled: true,
    openClawStreaming: false,
    snapshot: snapshot(),
    now: NOW,
    ...overrides,
  });
}

describe("createArmedContinuationWatch", () => {
  it("records the builder target at auto-send time", () => {
    const watch = createArmedContinuationWatch(snapshot({ activeVersionId: "ver-1" }), NOW);
    expect(watch).toEqual({
      chatId: "chat-1",
      versionIdAtSend: "ver-1",
      startedAt: NOW,
      messageCountAtSend: 4,
      // Named by the send itself once it reaches the builder, never guessed here.
      sendSeq: null,
      observedAt: null,
      observedStrong: false,
      resumedAt: null,
      quietSince: null,
    });
  });

  it("tolerates a missing snapshot", () => {
    const watch = createArmedContinuationWatch(null, NOW);
    expect(watch.chatId).toBeNull();
    expect(watch.versionIdAtSend).toBeNull();
    expect(watch.sendSeq).toBeNull();
  });
});

describe("observeBuilderTurn", () => {
  it("marks the turn as started when the builder streams", () => {
    const watch = watching({ observedAt: null, observedStrong: false });
    expect(observeBuilderTurn(watch, snapshot({ isStreaming: true })).observedStrong).toBe(true);
  });

  it("marks the turn as started when a new version appears", () => {
    const watch = watching({ observedAt: null, observedStrong: false, versionIdAtSend: "ver-1" });
    expect(observeBuilderTurn(watch, snapshot({ activeVersionId: "ver-2" })).observedStrong).toBe(
      true,
    );
  });

  it("marks the turn as started on a running version status", () => {
    const watch = watching({ observedAt: null, observedStrong: false, versionIdAtSend: "ver-1" });
    const seen = observeBuilderTurn(
      watch,
      snapshot({ activeVersionId: "ver-1", versionStatus: "generating" }),
    );
    expect(seen.observedStrong).toBe(true);
  });

  it("sees a grown chat, but only as a weak signal", () => {
    // A clarification question can open and close between two polls; the only
    // trace left is that the builder chat got longer. That also happens the
    // instant the auto-send posts its own message, so it is not proof of a
    // finished turn.
    const watch = watching({ observedAt: null, observedStrong: false, messageCountAtSend: 4 });
    const seen = observeBuilderTurn(
      watch,
      snapshot({ activeVersionId: "ver-1", isStreaming: false, chatMessageCount: 6 }),
      NOW,
    );
    expect(seen.observedAt).toBe(NOW);
    expect(seen.observedStrong).toBe(false);
  });

  it("returns the same object when nothing has happened yet", () => {
    const watch = watching({ observedAt: null, observedStrong: false, versionIdAtSend: "ver-1" });
    const seen = observeBuilderTurn(
      watch,
      snapshot({
        activeVersionId: "ver-1",
        isStreaming: false,
        versionStatus: "idle",
        chatMessageCount: 4,
      }),
    );
    expect(seen).toBe(watch);
  });
});

describe("decideArmedContinuation", () => {
  it("is idle without a pending watch", () => {
    expect(decide({ watch: null })).toEqual({ kind: "idle" });
  });

  it("resumes once the builder turn is terminal", () => {
    expect(decide()).toEqual({ kind: "resume", versionId: "ver-2", versionStatus: "ready" });
  });

  it("waits while the builder is still streaming", () => {
    expect(decide({ snapshot: snapshot({ isStreaming: true })}).kind).toBe("wait");
  });

  it("waits while the version is still being processed", () => {
    expect(decide({ snapshot: snapshot({ versionStatus: "verifying" }) }).kind).toBe("wait");
  });

  it("waits on an idle status — that is also what a not-yet-loaded one looks like", () => {
    expect(decide({ snapshot: snapshot({ versionStatus: "idle" }) }).kind).toBe("wait");
  });

  it("waits on an unknown status instead of guessing that the turn is done", () => {
    expect(decide({ snapshot: snapshot({ versionStatus: null }) }).kind).toBe("wait");
  });

  it("resumes on the other terminal statuses too", () => {
    for (const versionStatus of ["ready", "promoted", "degraded"]) {
      expect(decide({ snapshot: snapshot({ versionStatus }) }).kind).toBe("resume");
    }
  });

  it("never resumes without a builder to resume into", () => {
    expect(decide({ snapshot: null }).kind).toBe("wait");
  });

  it("waits while the user reads an older version than the one being built", () => {
    // The status is projected for the focused version, so a terminal status on
    // an older one says nothing about the turn the auto-send started.
    expect(decide({ snapshot: snapshot({ versionIsLatest: false }) }).kind).toBe("wait");
  });

  it("gives up on a pinned older view instead of stalling to the absolute cap", () => {
    const decision = decide({
      watch: watching({ startedAt: NOW - CONTINUATION_STALE_VIEW_TIMEOUT_MS - 1 }),
      snapshot: snapshot({ versionIsLatest: false }),
    });
    expect(decision).toMatchObject({ kind: "abort", notify: true });
  });

  it("waits until the turn has visibly started", () => {
    const decision = decide({
      watch: watching({ observedAt: null, observedStrong: false }),
      snapshot: snapshot({ isStreaming: false, versionStatus: "idle" }),
    });
    expect(decision.kind).toBe("wait");
  });

  it("does not trust a weak-only observation until it settles", () => {
    // The grown chat may just be the message the auto-send posted, while the
    // status still describes the previous version.
    expect(
      decide({ watch: watching({ observedStrong: false, observedAt: NOW - 1000 }) }).kind,
    ).toBe("wait");
    expect(
      decide({
        watch: watching({
          observedStrong: false,
          observedAt: NOW - CONTINUATION_WEAK_CONFIRM_MS - 1,
        }),
      }).kind,
    ).toBe("resume");
  });

  it("wakes OpenClaw only once per builder turn", () => {
    expect(decide({ watch: watching({ resumedAt: NOW - 1000 }) }).kind).toBe("wait");
  });

  it("stops when the builder refused the send", () => {
    // Stale base, F3 env gate or the credit gate: the version keeps its old
    // terminal status, so nothing else in the snapshot reveals the refusal.
    const decision = decide({ snapshot: snapshot({ rejectedSendSeq: 7 }) });
    expect(decision).toMatchObject({ kind: "abort", notify: true, disarm: true });
  });

  it("stops when the builder is waiting for the user", () => {
    // A pending clarification or plan approval is the user's to answer; sending
    // past it would consent on their behalf.
    const decision = decide({ snapshot: snapshot({ awaitingInput: true }) });
    expect(decision).toMatchObject({ kind: "abort", notify: true, disarm: true });
  });

  it("stops on a refusal that left no visible turn behind", () => {
    // A rolled-back send erases its own optimistic message, so the refusal must
    // be read before the "has the turn started?" gate.
    const decision = decide({
      watch: watching({ observedAt: null, observedStrong: false }),
      snapshot: snapshot({ rejectedSendSeq: 7 }),
    });
    expect(decision).toMatchObject({ kind: "abort", notify: true });
  });

  it("ignores a refusal that belongs to an earlier turn", () => {
    // A send that ended before this watch existed says nothing about ours —
    // acting on it would kill a mandate that just armed.
    const decision = decide({
      watch: watching({ sendSeq: 7 }),
      snapshot: snapshot({ rejectedSendSeq: 6 }),
    });
    expect(decision.kind).not.toBe("abort");
  });

  it("ignores a refusal from another sender while our own turn is still running", () => {
    // A manual retry, a catalogue insert or a plan decision can fail at any
    // point during an autonomous build. Timestamps could not tell those apart
    // from our own refusal, so any of them killed a mandate that was fine.
    const decision = decide({
      watch: watching({ sendSeq: 7 }),
      snapshot: snapshot({ rejectedSendSeq: 9, versionStatus: "generating" }),
    });
    expect(decision).toMatchObject({ kind: "wait" });
  });

  it("falls back to timing for a send that never named itself", () => {
    // Without an id there is nothing to match, and ignoring the refusal would
    // let the run wait out a timeout instead of stopping. The blunt comparison
    // is the lesser evil, so it stays for exactly this case.
    const decision = decide({
      watch: watching({ sendSeq: null, startedAt: NOW - 5_000 }),
      snapshot: snapshot({ rejectedSendSeq: 7, rejectedAt: NOW - 1_000 }),
    });
    expect(decision).toMatchObject({ kind: "abort", notify: true, disarm: true });
  });

  it("does not let the timing fallback override a named send", () => {
    // Once the turn has an id, a foreign refusal is a foreign refusal however
    // recent it is — otherwise the fallback would undo the whole fix.
    const decision = decide({
      watch: watching({ sendSeq: 7, startedAt: NOW - 5_000 }),
      snapshot: snapshot({
        rejectedSendSeq: 9,
        rejectedAt: NOW - 1_000,
        versionStatus: "generating",
      }),
    });
    expect(decision).toMatchObject({ kind: "wait" });
  });

  it("waits while the focus is still on the version we sent from", () => {
    // A terminal status on the old row describes the previous build; focus only
    // moves once this turn's version exists.
    const decision = decide({
      watch: watching({ versionIdAtSend: "ver-2" }),
      snapshot: snapshot({ activeVersionId: "ver-2" }),
    });
    expect(decision.kind).toBe("wait");
  });

  it("gives up when no version ever comes out of the turn", () => {
    const decision = decide({
      watch: watching({
        versionIdAtSend: "ver-2",
        quietSince: NOW - CONTINUATION_NO_VERSION_MS - 1,
      }),
      snapshot: snapshot({ activeVersionId: "ver-2" }),
    });
    expect(decision).toMatchObject({ kind: "abort", notify: true, disarm: true });
  });

  it("waits for the builder picture to hold still before waking", () => {
    // Context fields are published a commit apart, so a status read the instant
    // streaming stops may not carry the outcome of the send yet.
    expect(decide({ watch: watching({ quietSince: null }) }).kind).toBe("wait");
    expect(decide({ watch: watching({ quietSince: NOW - 500 }) }).kind).toBe("wait");
    expect(decide({ watch: watching({ quietSince: NOW - CONTINUATION_QUIET_MS - 1 }) }).kind).toBe(
      "resume",
    );
  });

  it("does not time out a woken turn that is still being written", () => {
    // A long answer is not a silent one; the next auto-send can only come once
    // the stream is done.
    const decision = decide({
      watch: watching({ resumedAt: NOW - CONTINUATION_RESUME_FOLLOWTHROUGH_MS - 1 }),
      openClawStreaming: true,
    });
    expect(decision.kind).toBe("wait");
  });

  it("closes the run quietly when the woken turn brings no next step", () => {
    const decision = decide({
      watch: watching({ resumedAt: NOW - CONTINUATION_RESUME_FOLLOWTHROUGH_MS - 1 }),
    });
    expect(decision).toMatchObject({ kind: "abort", notify: false, disarm: true });
  });

  it("never sends in parallel with an in-flight OpenClaw turn", () => {
    expect(decide({ openClawStreaming: true }).kind).toBe("wait");
  });

  it("stops on a failed version and tells the user", () => {
    const decision = decide({ snapshot: snapshot({ versionStatus: "failed" }) });
    expect(decision).toMatchObject({ kind: "abort", notify: true });
  });

  it("stops on a blocked version", () => {
    expect(decide({ snapshot: snapshot({ versionStatus: "blocked" }) }).kind).toBe("abort");
  });

  it("stops quietly when the mandate is spent", () => {
    expect(decide({ mandate: mandate("followups", 0) })).toMatchObject({
      kind: "abort",
      notify: false,
    });
  });

  it("stops quietly when the mandate was disarmed", () => {
    expect(decide({ mandate: null })).toMatchObject({ kind: "abort", notify: false });
  });

  it("never resumes a review_next mandate", () => {
    expect(decide({ mandate: mandate("review_next", 1) })).toMatchObject({
      kind: "abort",
      notify: false,
    });
  });

  it("stops when the edit gate is off", () => {
    expect(decide({ editEnabled: false }).kind).toBe("abort");
  });

  it("stops when the builder chat changed under the build", () => {
    const decision = decide({ snapshot: snapshot({ chatId: "chat-2" }) });
    expect(decision).toMatchObject({ kind: "abort", notify: true });
  });

  it("stops when the build never started within the start window", () => {
    const decision = decide({
      watch: watching({ observedAt: null, observedStrong: false, startedAt: NOW - CONTINUATION_START_TIMEOUT_MS - 1 }),
      snapshot: snapshot({ isStreaming: false, versionStatus: "idle" }),
    });
    expect(decision).toMatchObject({ kind: "abort", notify: true });
  });

  it("stops when the overall wait cap is exceeded", () => {
    const decision = decide({
      watch: watching({ startedAt: NOW - CONTINUATION_MAX_WAIT_MS - 1 }),
      snapshot: snapshot({ isStreaming: true }),
    });
    expect(decision).toMatchObject({ kind: "abort", notify: true });
  });
});

describe("buildArmedContinuationPrompt", () => {
  it("cannot re-arm or stop the mandate it is continuing", () => {
    for (const remaining of [1, 4]) {
      for (const versionStatus of [null, "ready", "degraded"]) {
        const prompt = buildArmedContinuationPrompt({ remaining, versionStatus });
        expect(parseArmingDirective(prompt)).toBeNull();
        expect(parseStopDirective(prompt)).toBe(false);
      }
    }
  });

  it("names the remaining budget so the wake-up turn is honest", () => {
    expect(buildArmedContinuationPrompt({ remaining: 3, versionStatus: "ready" })).toContain(
      "3 steg kvar",
    );
    expect(buildArmedContinuationPrompt({ remaining: 1, versionStatus: null })).toContain(
      "sista steget",
    );
  });

  it("carries the version status when one is known", () => {
    expect(buildArmedContinuationPrompt({ remaining: 2, versionStatus: "degraded" })).toContain(
      "degraded",
    );
  });
});

describe("mandate accounting across a two-step run", () => {
  it("authorizes exactly as many resumes as the mandate has steps", () => {
    // Mirrors the live loop: auto-send consumes a step, the handshake resumes,
    // the next auto-send consumes the last step and the mandate goes null.
    let live: ArmedMandate | null = createArmedMandate(
      { mode: "followups", count: 2, reason: "gör 2 follow-ups" },
      NOW,
    );
    const resumes: number[] = [];

    for (let step = 0; step < 5 && live; step += 1) {
      live = live.remaining > 1 ? { ...live, remaining: live.remaining - 1 } : null;
      const decision = decideArmedContinuation({
        watch: watching(),
        mandate: live,
        editEnabled: true,
        openClawStreaming: false,
        snapshot: snapshot(),
        now: NOW,
      });
      if (decision.kind === "resume") resumes.push(step);
    }

    expect(resumes).toEqual([0]);
  });
});
