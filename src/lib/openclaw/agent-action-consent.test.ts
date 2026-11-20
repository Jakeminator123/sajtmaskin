import { beforeEach, describe, expect, it } from "vitest";

import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import {
  AGENT_MISSION_ACTION_BUDGET,
  AGENT_MISSION_RESULT_TTL_MS,
  AGENT_MISSION_STREAM_LAG_MS,
  claimMissionAction,
  clearMissionAwaitingResult,
  hasMissionAwaitingResult,
  isAgentActionConsentLive,
  markMissionAwaitingResult,
  remainingMissionActions,
  resetAgentMissionLedgerForTests,
  resolveAgentActionConsent,
  takeMissionContinuation,
} from "./agent-action-consent";

function msg(
  id: string,
  role: "user" | "assistant",
  content: string,
  extra: Partial<OpenClawMessage> = {},
): OpenClawMessage {
  return { id, role, content, timestamp: 1, kind: "chat", ...extra } as OpenClawMessage;
}

beforeEach(() => {
  resetAgentMissionLedgerForTests();
});

describe("resolveAgentActionConsent", () => {
  it("lets a reply act directly on a user turn that carries consent", () => {
    const messages = [
      msg("u1", "user", "Kan du lägga till en karta på kontaktsidan?", { allowBuild: true }),
      msg("a1", "assistant", ""),
    ];
    expect(resolveAgentActionConsent(messages, "a1")).toEqual({
      allowed: true,
      missionTurnId: "u1",
      userTurnId: "u1",
      denial: null,
      remaining: AGENT_MISSION_ACTION_BUDGET,
    });
  });

  // Texten avgör inte längre: medgivandet sätts av komposern (läge + smal
  // spärr i `composerAllowsAgentBuild`). Utan flaggan agerar ingenting.
  it.each([
    "Byt rubriken till Välkommen",
    "Kan du lägga till en karta?",
    "Blåare knappar",
  ])("keeps «%s» as a proposal when the turn carries no consent", (text) => {
    const messages = [msg("u1", "user", text), msg("a1", "assistant", "")];
    const consent = resolveAgentActionConsent(messages, "a1");
    expect(consent.allowed).toBe(false);
    expect(consent.denial).toBe("no-consent");
    expect(consent.userTurnId).toBe("u1");
  });

  // Försvar på djupet: flaggan räcker inte när textens egen spärr säger nej.
  it.each(["Vad tycker du om startsidan?", "Ändra inget", "Stopp!"])(
    "does not trust a consent flag on «%s»",
    (text) => {
      const messages = [msg("u1", "user", text, { allowBuild: true }), msg("a1", "assistant", "")];
      expect(resolveAgentActionConsent(messages, "a1")).toMatchObject({
        allowed: false,
        denial: "no-consent",
        userTurnId: "u1",
      });
    },
  );

  it("never acts on a turn restored from history", () => {
    const messages = [
      msg("u1", "user", "Byt rubriken till Välkommen", { allowBuild: true, hydrated: true }),
      msg("a1", "assistant", ""),
    ];
    expect(resolveAgentActionConsent(messages, "a1")).toMatchObject({
      allowed: false,
      denial: "hydrated",
    });
  });

  it("follows a file-content turn back to the question it serves", () => {
    const messages = [
      msg("u1", "user", "Lägg till en rosa knapp i headern", { allowBuild: true }),
      msg("a1", "assistant", "Jag läser filen först."),
      msg("f1", "user", "[Filinnehåll] --- app/page.tsx ---", { kind: "internal" }),
      msg("a2", "assistant", ""),
    ];
    expect(resolveAgentActionConsent(messages, "a2")).toMatchObject({
      allowed: true,
      missionTurnId: "u1",
      userTurnId: "u1",
    });
  });

  it("never lets a plain build-result wake-up start the next build", () => {
    const messages = [
      msg("u1", "user", "Byt rubriken till Välkommen", { allowBuild: true }),
      msg("a1", "assistant", "Bygget startar."),
      msg("d1", "user", "[Byggresultat] Builderturen är klar.", { kind: "internal" }),
      msg("a2", "assistant", ""),
    ];
    expect(resolveAgentActionConsent(messages, "a2")).toMatchObject({
      allowed: false,
      denial: "machine-turn",
      userTurnId: "d1",
      missionTurnId: null,
    });
  });

  it("does not trust a machine turn that claims consent without naming its mission", () => {
    const messages = [
      msg("u1", "user", "Byt rubriken till Välkommen", { allowBuild: true }),
      msg("a1", "assistant", "Bygget startar."),
      msg("d1", "user", "[Byggresultat] Builderturen är klar.", { kind: "internal", allowBuild: true }),
      msg("a2", "assistant", ""),
    ];
    expect(resolveAgentActionConsent(messages, "a2")).toMatchObject({
      allowed: false,
      denial: "machine-turn",
    });
  });

  it("lets a build-result turn carry the mission on when the provider bound it", () => {
    const messages = [
      msg("u1", "user", "Byt rubriken till Välkommen", { allowBuild: true }),
      msg("a1", "assistant", "Bygget startar."),
      msg("d1", "user", "[Byggresultat] Builderturen är misslyckad.", {
        kind: "internal",
        allowBuild: true,
        missionTurnId: "u1",
      }),
      msg("a2", "assistant", ""),
    ];
    expect(resolveAgentActionConsent(messages, "a2")).toMatchObject({
      allowed: true,
      missionTurnId: "u1",
      userTurnId: "d1",
    });
  });

  it("ends a carried mission when its own turn has lost consent (Fråga, stopp)", () => {
    const messages = [
      msg("u1", "user", "Byt rubriken till Välkommen", { allowBuild: false }),
      msg("a1", "assistant", "Bygget startar."),
      msg("d1", "user", "[Byggresultat] Builderturen är klar.", {
        kind: "internal",
        allowBuild: true,
        missionTurnId: "u1",
      }),
      msg("a2", "assistant", ""),
    ];
    expect(resolveAgentActionConsent(messages, "a2")).toMatchObject({
      allowed: false,
      denial: "no-consent",
      missionTurnId: "u1",
    });
  });

  it("reports an unknown reply and a reply without a user turn", () => {
    expect(resolveAgentActionConsent([], "nope")).toMatchObject({
      allowed: false,
      denial: "no-user-turn",
      userTurnId: null,
    });
    expect(resolveAgentActionConsent([msg("a1", "assistant", "")], "a1")).toMatchObject({
      allowed: false,
      denial: "no-user-turn",
    });
  });
});

describe("uppdragets budget", () => {
  const messages = [
    msg("u1", "user", "Gör om kontaktsidan", { allowBuild: true }),
    msg("a1", "assistant", ""),
  ];

  it(`allows ${AGENT_MISSION_ACTION_BUDGET} automatic actions per mission, then denies`, () => {
    for (let step = 0; step < AGENT_MISSION_ACTION_BUDGET; step += 1) {
      expect(resolveAgentActionConsent(messages, "a1").allowed).toBe(true);
      expect(claimMissionAction("u1", `turn-${step}`)).toBe(true);
    }
    expect(remainingMissionActions("u1")).toBe(0);
    expect(claimMissionAction("u1", "turn-next")).toBe(false);
    expect(resolveAgentActionConsent(messages, "a1")).toMatchObject({
      allowed: false,
      denial: "budget-spent",
      missionTurnId: "u1",
    });
  });

  it("answers one turn with at most one automatic action", () => {
    expect(claimMissionAction("u1", "u1")).toBe(true);
    // A second reply to the same turn is a proposal, although budget remains.
    expect(claimMissionAction("u1", "u1")).toBe(false);
    expect(remainingMissionActions("u1")).toBe(AGENT_MISSION_ACTION_BUDGET - 1);
    // The next step of the mission arrives with its own build-result turn.
    expect(claimMissionAction("u1", "digest-1")).toBe(true);
  });

  it("keeps the budgets of two missions apart", () => {
    for (let step = 0; step < AGENT_MISSION_ACTION_BUDGET; step += 1) claimMissionAction("u1", `turn-${step}`);
    expect(remainingMissionActions("u2")).toBe(AGENT_MISSION_ACTION_BUDGET);
    expect(claimMissionAction("u2", "u2")).toBe(true);
  });

  it("treats a spent budget as live consent for the action that spent it", () => {
    for (let step = 0; step < AGENT_MISSION_ACTION_BUDGET; step += 1) claimMissionAction("u1", `turn-${step}`);
    // Reservationen förbrukade budgeten; åtgärden som gjorde den får slutföras.
    expect(isAgentActionConsentLive(messages, "a1")).toBe(true);
  });

  it("stops a reserved action when the consent itself is revoked", () => {
    claimMissionAction("u1", "u1");
    const revoked = [msg("u1", "user", "Gör om kontaktsidan", { allowBuild: false }), messages[1]];
    expect(isAgentActionConsentLive(revoked, "a1")).toBe(false);
  });
});

describe("takeMissionContinuation", () => {
  const messages = [
    msg("u1", "user", "Gör om kontaktsidan", { allowBuild: true }),
    msg("a1", "assistant", "Bygget startar."),
  ];
  const scopeKey = "builder::chat-1";

  it("continues the mission after the build the agent itself started", () => {
    claimMissionAction("u1", "u1");
    markMissionAwaitingResult("u1", scopeKey, 1_000);
    expect(hasMissionAwaitingResult(scopeKey)).toBe(true);
    expect(
      takeMissionContinuation({ messages, scopeKey, streamStartedAt: 1_200, now: 60_000 }),
    ).toEqual({ missionTurnId: "u1", remaining: AGENT_MISSION_ACTION_BUDGET - 1 });
  });

  it("gives one continuation per result", () => {
    markMissionAwaitingResult("u1", scopeKey, 1_000);
    expect(takeMissionContinuation({ messages, scopeKey, streamStartedAt: 1_200, now: 2_000 })).not.toBeNull();
    expect(takeMissionContinuation({ messages, scopeKey, streamStartedAt: 1_200, now: 3_000 })).toBeNull();
    expect(hasMissionAwaitingResult(scopeKey)).toBe(false);
  });

  it("returns null when nothing waits: the user's own build only gets a summary", () => {
    expect(takeMissionContinuation({ messages, scopeKey, streamStartedAt: 1_200, now: 2_000 })).toBeNull();
  });

  it("ignores a stream that started long after the agent's action (a later, unrelated build)", () => {
    markMissionAwaitingResult("u1", scopeKey, 1_000);
    expect(
      takeMissionContinuation({
        messages,
        scopeKey,
        streamStartedAt: 1_000 + AGENT_MISSION_STREAM_LAG_MS + 1,
        now: 1_000 + AGENT_MISSION_STREAM_LAG_MS + 5_000,
      }),
    ).toBeNull();
  });

  it("ignores a stream that started before the agent's action, and a missing stream start", () => {
    markMissionAwaitingResult("u1", scopeKey, 100_000);
    expect(takeMissionContinuation({ messages, scopeKey, streamStartedAt: 50_000, now: 101_000 })).toBeNull();
    markMissionAwaitingResult("u1", scopeKey, 100_000);
    expect(takeMissionContinuation({ messages, scopeKey, streamStartedAt: null, now: 101_000 })).toBeNull();
  });

  it("does not carry a mission into another chat or past its time limit", () => {
    markMissionAwaitingResult("u1", scopeKey, 1_000);
    expect(
      takeMissionContinuation({ messages, scopeKey: "builder::chat-2", streamStartedAt: 1_200, now: 2_000 }),
    ).toBeNull();
    markMissionAwaitingResult("u1", scopeKey, 1_000);
    expect(
      takeMissionContinuation({
        messages,
        scopeKey,
        streamStartedAt: 1_200,
        now: 1_000 + AGENT_MISSION_RESULT_TTL_MS + 1,
      }),
    ).toBeNull();
  });

  it("stops when the mission's turn lost consent or its budget is spent", () => {
    markMissionAwaitingResult("u1", scopeKey, 1_000);
    const revoked = [msg("u1", "user", "Gör om kontaktsidan", { allowBuild: false }), messages[1]];
    expect(
      takeMissionContinuation({ messages: revoked, scopeKey, streamStartedAt: 1_200, now: 2_000 }),
    ).toBeNull();

    for (let step = 0; step < AGENT_MISSION_ACTION_BUDGET; step += 1) claimMissionAction("u1", `turn-${step}`);
    markMissionAwaitingResult("u1", scopeKey, 1_000);
    expect(takeMissionContinuation({ messages, scopeKey, streamStartedAt: 1_200, now: 2_000 })).toBeNull();
  });

  it("releases the wait when the build never started", () => {
    markMissionAwaitingResult("u1", scopeKey, 1_000);
    clearMissionAwaitingResult("another-mission");
    expect(hasMissionAwaitingResult(scopeKey)).toBe(true);
    clearMissionAwaitingResult("u1");
    expect(hasMissionAwaitingResult(scopeKey)).toBe(false);
  });
});
